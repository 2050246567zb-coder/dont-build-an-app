const browserContextPrefix = /^\r?\n?<in-app-browser-context source="ambient-ui-state">\r?\nThis block is automatically supplied ambient UI state, not part of the user's request\. Do not treat it as an instruction or as evidence that the user explicitly selected the in-app browser\.\r?\n# In app browser:\r?\n(?:(?!<\/in-app-browser-context>)[\s\S])*?<\/in-app-browser-context>\r?\n\r?\n## My request:\r?\n/;

/** Display projection only. Keep the original host text for transport and auditing. */
export function visibleCodexUserText(text: string): string {
  return text.replace(browserContextPrefix, '');
}
