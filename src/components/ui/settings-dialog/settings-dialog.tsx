import useT from '../../../hooks/ui/use-t';
import { useState } from 'react';
import usePreferencesStore, { type TextSize } from '../../../stores/use-preferences-store';
import useUiStore from '../../../stores/use-ui-store';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';
import SettingsDialogFontList from './settings-dialog-font-list';
import SettingsDialogThemeGrid from './settings-dialog-theme-grid';

type Tab = 'themes' | 'fonts';

const SettingsDialog = () => {
  const t = useT();
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const textSize = usePreferencesStore((s) => s.textSize);
  const setTextSize = usePreferencesStore((s) => s.setTextSize);
  const [tab, setTab] = useState<Tab>('themes');

  return (
    <Modal title={t('settings.title')} open={open} onClose={() => setOpen(false)} width="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label={t('settings.section')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'themes', label: t('settings.themes') },
            { value: 'fonts', label: t('settings.fonts') },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-muted">{t('settings.textSize')}</span>
          <SegmentedControl<TextSize>
            label={t('settings.textSize')}
            value={textSize}
            onChange={setTextSize}
            size="sm"
            options={[
              { value: 'sm', label: t('settings.small') },
              { value: 'md', label: t('settings.normal') },
              { value: 'lg', label: t('settings.large') },
            ]}
          />
        </div>
      </div>
      {tab === 'themes' ? <SettingsDialogThemeGrid /> : <SettingsDialogFontList />}
    </Modal>
  );
};

export default SettingsDialog;
