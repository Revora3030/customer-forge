/**
 * Keyboard rules for the chat composer, kept pure so they can be tested.
 *
 * - Enter sends.
 * - Shift+Enter (and Alt+Enter) adds a new line.
 * - Nothing sends while an input method editor (Japanese, Chinese, Korean,
 *   dictation…) is still composing: the Enter that confirms a candidate must
 *   never send a half-composed message. Safari reports that Enter as keyCode
 *   229 without setting `isComposing`, so all three signals are checked.
 */
export type EnterKeyInput = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  /** Our own compositionstart/compositionend tracking. */
  composing?: boolean;
  /** `KeyboardEvent.isComposing` from the browser. */
  nativeComposing?: boolean;
  keyCode?: number;
};

export type EnterKeyAction = "submit" | "newline" | "ignore";

/** IME "process" key code browsers send while a composition is in progress. */
export const IME_PROCESS_KEY_CODE = 229;

export function enterKeyAction(input: EnterKeyInput): EnterKeyAction {
  if (input.key !== "Enter") return "ignore";
  if (input.composing || input.nativeComposing || input.keyCode === IME_PROCESS_KEY_CODE)
    return "ignore";
  if (input.shiftKey || input.altKey) return "newline";
  return "submit";
}

/**
 * True when a submit event really came from the composer's own form, not from
 * a form rendered in a portal (dialog, popover) whose React submit event
 * bubbles through the component tree to the composer.
 */
export function isOwnFormSubmit(target: EventTarget | null, form: EventTarget | null): boolean {
  return Boolean(target && form && target === form);
}
