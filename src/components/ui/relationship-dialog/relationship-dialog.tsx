import useT from '../../../hooks/ui/use-t';
import useRelationshipForm from '../../../hooks/model/use-relationship-form';
import Button from '../button/button';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';
import RelationshipDialogEntities from './relationship-dialog-entities';
import RelationshipDialogPreview from './relationship-dialog-preview';

const RelationshipDialog = () => {
  const t = useT();
  const form = useRelationshipForm();
  const { open, close, entities, arity, changeArity, preset, setPreset, ids, create, valid, recursive } = form;

  return (
    <Modal
      title={t('relDialog.title')}
      open={open}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} onClick={create}>
            {t('relDialog.create')}
          </Button>
        </>
      }
    >
      {entities.length === 0 ? (
        <p>{t('relDialog.needEntity')}</p>
      ) : (
        <div className="space-y-5">
          <SegmentedControl
            label={t('rel.participants')}
            value={arity}
            onChange={changeArity}
            options={[
              { value: 'binary', label: t('relDialog.binary') },
              { value: 'nary', label: t('relDialog.ternary') },
            ]}
          />
          <RelationshipDialogEntities form={form} />
          {arity === 'binary' && (
            <div className="space-y-2">
              <span className="block font-medium">{t('rel.cardinality')}</span>
              <SegmentedControl
                label={t('rel.cardinality')}
                value={preset}
                onChange={setPreset}
                options={[
                  { value: '1:1', label: '1 a 1' },
                  { value: '1:N', label: '1 a N' },
                  { value: 'N:M', label: 'N a M' },
                ]}
              />
            </div>
          )}
          <RelationshipDialogPreview ids={ids} preset={arity === 'binary' ? preset : 'N:M'} recursive={recursive} entities={entities} />
        </div>
      )}
    </Modal>
  );
};

export default RelationshipDialog;
