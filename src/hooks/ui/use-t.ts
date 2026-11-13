import { useCallback } from 'react';
import { t, type MessageKey, type Params } from '../../i18n';
import usePreferencesStore from '../../stores/use-preferences-store';

/** Translation function bound to the current language; components re-render when it changes. */
const useT = () => {
  const locale = usePreferencesStore((s) => s.locale);
  return useCallback((key: MessageKey, params?: Params) => t(key, params, locale), [locale]);
};

export default useT;
