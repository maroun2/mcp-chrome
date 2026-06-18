{
  description = "mcp-chrome bridge — VPS-hostable Chrome MCP bridge server";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_22;
        # lockfileVersion 6.0 → pnpm 8; fall back to pkgs.pnpm if pnpm_8 not present
        pnpm = pkgs.pnpm_8 or pkgs.pnpm;

        mcpChromeBridge = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "mcp-chrome-bridge";
          version = "1.0.29";
          src = ./.;

          nativeBuildInputs = [
            nodejs
            pnpm
            pnpm.configHook       # runs pnpm install --offline --ignore-scripts
            pkgs.makeWrapper
            pkgs.python3          # required by node-gyp
            pkgs.pkg-config
            pkgs.nodePackages.node-gyp   # compile better-sqlite3
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.stdenv.cc        # C++ compiler for better-sqlite3
          ];

          pnpmDeps = pnpm.fetchDeps {
            inherit (finalAttrs) pname version src;
            # To update: run `nix build 2>&1 | grep "got:"` and paste the hash here
            hash = "sha256-j05kL2XgWWVfeD0+BXaTHDSUq144GDuWO8HE9ywbaZc=";
          };

          # configHook handles: store-dir, pnpm install --offline --ignore-scripts
          # We still need to compile native modules (better-sqlite3) separately.
          # Use node-gyp directly to avoid pnpm's workspace network resolution.
          buildPhase = ''
            runHook preBuild

            _bs3=$(find node_modules/.pnpm -maxdepth 4 -name "binding.gyp" \
                   -path "*/better-sqlite3*" 2>/dev/null | head -1 | xargs -r dirname)
            if [ -n "$_bs3" ]; then
              echo "Compiling better-sqlite3 at $_bs3"
              pushd "$_bs3"
              HOME="$TMPDIR" node-gyp rebuild \
                --nodedir="${nodejs}" \
                --python="${pkgs.python3}/bin/python3"
              popd
            fi

            pnpm --filter chrome-mcp-shared build
            pnpm --filter mcp-chrome-bridge build

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            local lib="$out/lib/mcp-chrome-bridge"
            mkdir -p "$lib/node_modules"

            # Compiled server
            cp -r app/native-server/dist "$lib/dist"

            # Virtual store (actual package files + relative internal symlinks).
            # cp -r preserves the internal relative symlinks so they still resolve.
            cp -r node_modules/.pnpm "$lib/node_modules/.pnpm"

            # Recreate the bridge server's top-level package symlinks.
            # In app/native-server/node_modules/:
            #   PKG      -> ../../../node_modules/.pnpm/PKG@V/…/PKG
            #   @sc/PKG  -> ../../../../node_modules/.pnpm/@sc+PKG@V/…/@sc/PKG
            # New paths relative to $lib/node_modules/:
            #   PKG      -> .pnpm/PKG@V/…/PKG           (strip 3-level ../../../node_modules/)
            #   @sc/PKG  -> ../.pnpm/@sc+PKG@V/…/@sc/PKG (strip 4-level ../../../../node_modules/, add ../)
            for entry in app/native-server/node_modules/*/; do
              name=$(basename "$entry")
              case "$name" in .*) continue ;; esac      # skip .bin, .modules.yaml …
              if [ -L "app/native-server/node_modules/$name" ]; then
                target=$(readlink "app/native-server/node_modules/$name")
                new="''${target#*node_modules/}"        # strip up to first node_modules/
                ln -sf "$new" "$lib/node_modules/$name"
              fi
            done

            for scope_dir in app/native-server/node_modules/@*/; do
              scope=$(basename "$scope_dir")
              mkdir -p "$lib/node_modules/$scope"
              for entry in "$scope_dir"*/; do
                name=$(basename "$entry")
                if [ -L "$scope_dir$name" ]; then
                  target=$(readlink "$scope_dir$name")
                  new="../''${target#*node_modules/}"   # one extra ../ for the @scope/ level
                  ln -sf "$new" "$lib/node_modules/$scope/$name"
                fi
              done
            done

            # chrome-mcp-shared is a workspace dep (symlink to ../../../packages/shared).
            # Replace with the actual built dist so it works outside the monorepo.
            rm -f "$lib/node_modules/chrome-mcp-shared"
            mkdir -p "$lib/node_modules/chrome-mcp-shared"
            cp -r packages/shared/dist  "$lib/node_modules/chrome-mcp-shared/dist"
            cp packages/shared/package.json "$lib/node_modules/chrome-mcp-shared/package.json"

            # Mirror the replacement into the virtual store entries as well.
            while IFS= read -r lnk; do
              rm "$lnk"
              mkdir -p "$lnk"
              cp -r packages/shared/dist  "$lnk/dist"
              cp packages/shared/package.json "$lnk/package.json"
            done < <(find "$lib/node_modules/.pnpm" -maxdepth 4 \
                          -name "chrome-mcp-shared" -type l 2>/dev/null)

            mkdir -p "$out/bin"
            makeWrapper "${nodejs}/bin/node" "$out/bin/mcp-chrome-bridge" \
              --add-flags "$lib/dist/index.js" \
              --chdir "$lib"

            runHook postInstall
          '';

          meta = {
            description = "Chrome MCP bridge server";
            license = pkgs.lib.licenses.mit;
            platforms = pkgs.lib.platforms.linux ++ pkgs.lib.platforms.darwin;
          };
        });
      in
      {
        packages.default = mcpChromeBridge;

        apps.default = {
          type = "app";
          program = "${mcpChromeBridge}/bin/mcp-chrome-bridge";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ nodejs pnpm ];
          shellHook = ''
            echo "mcp-chrome-bridge dev — Node $(node --version), pnpm $(pnpm --version)"
            echo ""
            echo "  pnpm install"
            echo "  pnpm --filter chrome-mcp-shared build"
            echo "  pnpm --filter mcp-chrome-bridge build"
            echo "  BRIDGE_HOST=0.0.0.0 BRIDGE_TOKEN=dev node app/native-server/dist/index.js"
          '';
        };
      }
    ) // {

      # -----------------------------------------------------------------------
      # NixOS module — wire into any NixOS system configuration
      #
      # Example configuration.nix:
      #
      #   inputs.mcp-chrome.url = "github:maroun2/mcp-chrome/vps-bridge-approval";
      #
      #   { imports = [ inputs.mcp-chrome.nixosModules.default ];
      #     services.mcp-chrome-bridge = {
      #       enable      = true;
      #       host        = "0.0.0.0";
      #       port        = 12306;
      #       # Create: echo "BRIDGE_TOKEN=secret" > /etc/mcp-chrome-bridge.env
      #       # chmod 600 /etc/mcp-chrome-bridge.env
      #       environmentFile = "/etc/mcp-chrome-bridge.env";
      #       openFirewall = true;
      #     };
      #   }
      # -----------------------------------------------------------------------
      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.mcp-chrome-bridge;
          pkg = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        in
        {
          options.services.mcp-chrome-bridge = {
            enable = lib.mkEnableOption "mcp-chrome bridge server";

            host = lib.mkOption {
              type    = lib.types.str;
              default = "127.0.0.1";
              example = "0.0.0.0";
              description = ''
                Address to bind. Set to 0.0.0.0 to accept connections from all
                interfaces (required for VPS deployments behind a reverse proxy or firewall).
              '';
            };

            port = lib.mkOption {
              type        = lib.types.port;
              default     = 12306;
              description = "TCP port for MCP SSE and the WebSocket bridge.";
            };

            environmentFile = lib.mkOption {
              type    = lib.types.nullOr lib.types.path;
              default = null;
              example = "/etc/mcp-chrome-bridge.env";
              description = ''
                Path to a systemd EnvironmentFile (key=value lines, not Nix-store-safe).
                Use this to inject BRIDGE_TOKEN without placing it in the Nix store:

                  BRIDGE_TOKEN=my-secret-token

                When null the server auto-generates a random token on first start and
                writes it to /var/lib/mcp-chrome-bridge/.agor/browser-bridge.token
              '';
            };

            user = lib.mkOption {
              type        = lib.types.str;
              default     = "mcp-chrome";
              description = "System user account to run the bridge under.";
            };

            group = lib.mkOption {
              type        = lib.types.str;
              default     = "mcp-chrome";
              description = "System group for the bridge process.";
            };

            openFirewall = lib.mkOption {
              type        = lib.types.bool;
              default     = false;
              description = "Open cfg.port in the NixOS firewall (ufw / iptables).";
            };
          };

          config = lib.mkIf cfg.enable {

            users.users.${cfg.user} = lib.mkDefault {
              isSystemUser = true;
              group        = cfg.group;
              home         = "/var/lib/mcp-chrome-bridge";
              createHome   = false; # StateDirectory handles creation
            };

            users.groups.${cfg.group} = lib.mkDefault {};

            networking.firewall.allowedTCPPorts =
              lib.mkIf cfg.openFirewall [ cfg.port ];

            systemd.services.mcp-chrome-bridge = {
              description = "mcp-chrome bridge server";
              wantedBy    = [ "multi-user.target" ];
              after       = [ "network.target" ];

              environment = {
                BRIDGE_HOST = cfg.host;
                BRIDGE_PORT = toString cfg.port;
                # HOME drives the auto-generated token path:
                #   $HOME/.agor/browser-bridge.token
                HOME = "/var/lib/mcp-chrome-bridge";
              };

              serviceConfig = {
                ExecStart   = "${pkg}/bin/mcp-chrome-bridge";
                User        = cfg.user;
                Group       = cfg.group;

                # /var/lib/mcp-chrome-bridge is created, owned by cfg.user, mode 0700
                StateDirectory     = "mcp-chrome-bridge";
                StateDirectoryMode = "0700";
                WorkingDirectory   = "/var/lib/mcp-chrome-bridge";

                Restart    = "on-failure";
                RestartSec = "5s";
                TimeoutStopSec = "10s";

                # Light hardening
                NoNewPrivileges = true;
                PrivateTmp      = true;
                ProtectSystem   = "strict";
                ProtectHome     = true;
                ReadWritePaths  = [ "/var/lib/mcp-chrome-bridge" ];
              } // lib.optionalAttrs (cfg.environmentFile != null) {
                EnvironmentFile = cfg.environmentFile;
              };

              preStart = ''
                mkdir -p /var/lib/mcp-chrome-bridge/.agor
              '';
            };
          };
        };
    };
}
