export { prepareLocal, applyKinds } from "./prepare.ts";
export { dialectImport, htmlToMarkdown, isRichPaste, normalizePlain } from "./normalize.ts";
export { repairMath } from "./math-repair.ts";
export { proposeStructure, collectStructureCandidates, applyStructureHints } from "./structure.ts";
export { proposeFrontMatter, mergeYamlFields } from "./front-matter.ts";
export { isFaithful } from "./fidelity.ts";
export { enhanceWithAi } from "./ai-enhance.ts";
export { llmChat } from "./llm-proxy.ts";
export { proposeFidelityFix, fixNotesLocal, SOURCE_FIXABLE } from "./fidelity-copilot.ts";
export type { CopilotResult, CopilotPatch } from "./fidelity-copilot.ts";
export {
  DEFAULT_LLM_SETTINGS,
  LLM_PROVIDERS,
  AI_FEATURES,
  DEEPSEEK_FLASH_MODEL,
  OPENROUTER_DEEPSEEK_FLASH_MODEL,
  loadLlmSettings,
  saveLlmSettings,
  applyProvider,
  enabledAiFeatures,
  hasLlmKey,
} from "./llm-settings.ts";
export type { Change, ChangeKind, PrepareResult } from "./types.ts";
export type { LlmSettings, LlmProviderId, AiFeatureId } from "./llm-settings.ts";
export type { AiEnhanceResult } from "./ai-enhance.ts";
