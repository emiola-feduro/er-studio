import useRelationshipForm from '../../../hooks/model/use-relationship-form';
import Button from '../button/button';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';
import RelationshipDialogEntities from './relationship-dialog-entities';
import RelationshipDialogPreview from './relationship-dialog-preview';

const RelationshipDialog = () => {
  const form = useRelationshipForm();
  const { open, close, entities, arity, changeArity, preset, setPreset, ids, create, valid, recursive } = form;

  return (
    <Modal
      title="Nueva relación"
      open={open}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={create}>
            Crear relación
          </Button>
        </>
      }
    >
      {entities.length === 0 ? (
        <p>Primero crea al menos una entidad.</p>
      ) : (
        <div className="space-y-5">
          <SegmentedControl
            label="Participantes"
            value={arity}
            onChange={changeArity}
            options={[
              { value: 'binary', label: 'Binaria o recursiva' },
              { value: 'nary', label: 'Ternaria o más' },
            ]}
          />
          <RelationshipDialogEntities form={form} />
          {arity === 'binary' && (
            <div className="space-y-2">
              <span className="block font-medium">Cardinalidad</span>
              <SegmentedControl
                label="Cardinalidad"
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
