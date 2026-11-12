import { createAttribute, createEntity, createProject, createRelationship, syncJunctions } from './model';
import type { DialectId, Entity, Project } from './types';
import type { RelationshipPreset } from './model';

/** Small builder used by tests to describe projects tersely. */
export const makeProject = (dialect: DialectId = 'postgresql') => {
  const project = createProject('Prueba', dialect);
  const api = {
    project,
    entity: (name: string, attrs: string[] = []): Entity => {
      const entity = createEntity(dialect, name, { x: 0, y: 0 });
      for (const attr of attrs) entity.attributes.push(createAttribute(dialect, { name: attr }));
      project.entities.push(entity);
      return entity;
    },
    relate: (entities: Entity[], preset: RelationshipPreset = '1:N') => {
      const rel = createRelationship(entities.map((e) => e.id), preset);
      project.relationships.push(rel);
      syncJunctions(project);
      return rel;
    },
    sync: (): Project => {
      syncJunctions(project);
      return project;
    },
  };
  return api;
};
