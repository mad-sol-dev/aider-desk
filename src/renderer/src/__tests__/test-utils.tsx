import { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';

const defaultHotkeyScopes = ['home', 'task', 'dialog', 'modal'];

type RenderWithHotkeysOptions = Parameters<typeof render>[1] & {
  scopes?: string[];
};

export const renderWithHotkeys = (ui: ReactElement, options: RenderWithHotkeysOptions = {}) => {
  const { scopes = defaultHotkeyScopes, ...renderOptions } = options;
  return render(<HotkeysProvider initiallyActiveScopes={scopes}>{ui}</HotkeysProvider>, renderOptions);
};
