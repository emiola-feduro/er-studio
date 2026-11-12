import { useState } from 'react';
import usePreferencesStore, { type TextSize } from '../../../stores/use-preferences-store';
import useUiStore from '../../../stores/use-ui-store';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';
import SettingsDialogFontList from './settings-dialog-font-list';
import SettingsDialogThemeGrid from './settings-dialog-theme-grid';

type Tab = 'themes' | 'fonts';

const SettingsDialog = () => {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const textSize = usePreferencesStore((s) => s.textSize);
  const setTextSize = usePreferencesStore((s) => s.setTextSize);
  const [tab, setTab] = useState<Tab>('themes');

  return (
    <Modal title="Apariencia" open={open} onClose={() => setOpen(false)} width="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Sección"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'themes', label: 'Temas' },
            { value: 'fonts', label: 'Fuentes' },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-muted">Tamaño de texto</span>
          <SegmentedControl<TextSize>
            label="Tamaño de texto"
            value={textSize}
            onChange={setTextSize}
            size="sm"
            options={[
              { value: 'sm', label: 'Pequeño' },
              { value: 'md', label: 'Normal' },
              { value: 'lg', label: 'Grande' },
            ]}
          />
        </div>
      </div>
      {tab === 'themes' ? <SettingsDialogThemeGrid /> : <SettingsDialogFontList />}
    </Modal>
  );
};

export default SettingsDialog;
