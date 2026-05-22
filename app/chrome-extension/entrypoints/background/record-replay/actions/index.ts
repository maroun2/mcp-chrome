/**
 * Action System - export模块
 */

// 类型export
export * from './types';

// 注册表export
export {
  ActionRegistry,
  createActionRegistry,
  ok,
  invalid,
  failed,
  tryResolveString,
  tryResolveNumber,
  tryResolveJson,
  tryResolveValue,
  type BeforeExecuteArgs,
  type BeforeExecuteHook,
  type AfterExecuteArgs,
  type AfterExecuteHook,
  type ActionRegistryHooks,
} from './registry';

// 适配器export
export {
  execCtxToActionCtx,
  stepToAction,
  actionResultToExecResult,
  createStepExecutor,
  isActionSupported,
  getActionType,
  type StepExecutionAttempt,
} from './adapter';

// Handler 工厂export
export {
  createReplayActionRegistry,
  registerReplayHandlers,
  getSupportedActionTypes,
  isActionTypeSupported,
} from './handlers';
