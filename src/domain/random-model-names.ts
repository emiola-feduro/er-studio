import type { Locale } from '../i18n';

/**
 * Names used by the random model generator, keyed by the Spanish identifier the themes are written
 * with. Identifiers stay ASCII and snake_case in every language so they work in any gestor.
 */
type Dictionary = Record<string, string>;

const en: Dictionary = {
  // Themes
  Tienda: 'Store', Biblioteca: 'Library', Universidad: 'University', Hospital: 'Hospital', Aerolínea: 'Airline', Streaming: 'Streaming',
  // Tables
  cliente: 'customer', pedido: 'order', producto: 'product', categoria: 'category', proveedor: 'supplier', empleado: 'employee',
  envio: 'shipment', socio: 'member', libro: 'book', autor: 'author', editorial: 'publisher', ejemplar: 'book_copy', prestamo: 'loan',
  genero: 'genre', estudiante: 'student', curso: 'course', profesor: 'teacher', departamento: 'department', aula: 'classroom',
  carrera: 'degree', paciente: 'patient', medico: 'doctor', especialidad: 'specialty', cita: 'appointment', medicamento: 'medicine',
  habitacion: 'room', aeropuerto: 'airport', vuelo: 'flight', avion: 'aircraft', pasajero: 'passenger', reserva: 'booking',
  tripulante: 'crew_member', usuario: 'user', plan: 'plan', suscripcion: 'subscription', pelicula: 'movie', actor: 'actor', resena: 'review',
  // Columns
  nombre: 'name', apellido: 'last_name', email: 'email', telefono: 'phone', creado_en: 'created_at', fecha: 'recorded_on', estado: 'status',
  total: 'total', sku: 'sku', precio: 'price', stock: 'stock', descripcion: 'description', pais: 'country', fecha_ingreso: 'hire_date',
  direccion: 'address', ciudad: 'city', fecha_envio: 'shipped_on', cantidad: 'quantity', precio_unitario: 'unit_price', costo: 'cost',
  fecha_alta: 'joined_on', titulo: 'title', isbn: 'isbn', anio_publicacion: 'published_year', codigo: 'code',
  fecha_prestamo: 'loaned_on', fecha_devolucion: 'returned_on', fecha_nacimiento: 'birth_date', creditos: 'credits', edificio: 'building',
  capacidad: 'capacity', duracion_semestres: 'semesters', periodo: 'term', nota: 'grade', grupo_sanguineo: 'blood_type',
  licencia: 'license', fecha_hora: 'scheduled_at', motivo: 'reason', presentacion: 'presentation', numero: 'number', piso: 'floor',
  disponible: 'available', dosis: 'dose', dias: 'days', codigo_iata: 'iata_code', salida: 'departure', llegada: 'arrival',
  matricula: 'registration', modelo: 'model', pasaporte: 'passport', creada_en: 'created_at', asiento: 'seat', clase: 'travel_class',
  cargo: 'crew_role', fecha_registro: 'signed_up_on', precio_mensual: 'monthly_price', pantallas: 'screens', inicio: 'starts_on',
  fin: 'ends_on', activa: 'active', duracion_minutos: 'duration_minutes', anio: 'release_year', puntuacion: 'rating',
  comentario: 'comment', personaje: 'character_name',
  // Relationships and roles
  realiza: 'places', detalle: 'order_line', clasifica: 'classifies', suministra: 'supplies', atiende: 'handles', se_envia: 'ships_as',
  supervisa: 'manages', escribe: 'writes', publica: 'publishes', tiene: 'has', solicita: 'borrows', se_presta: 'is_loaned',
  agrupa: 'groups', inscripcion: 'enrollment', dicta: 'teaches', adscribe: 'employs', aloja: 'hosts', cursa: 'studies', ofrece: 'offers',
  prerrequisito: 'prerequisite', agenda: 'books', receta: 'prescription', hospeda: 'houses', sale_de: 'departs_from',
  llega_a: 'arrives_at', opera: 'operates', hace: 'makes', incluye: 'includes', asignacion: 'assignment', contrata: 'subscribes',
  define: 'defines', pertenece: 'belongs_to', reparto: 'cast_member', recibe: 'receives',
  jefe: 'manager', subordinado: 'report', requisito: 'requirement', origen: 'origin', destino: 'destination',
  // ENUM values
  PENDIENTE: 'PENDING', PAGADO: 'PAID', ENVIADO: 'SHIPPED', ENTREGADO: 'DELIVERED', DISPONIBLE: 'AVAILABLE', PRESTADO: 'LOANED',
  DANADO: 'DAMAGED', AUXILIAR: 'ASSISTANT', ASOCIADO: 'ASSOCIATE', TITULAR: 'FULL', PROGRAMADA: 'SCHEDULED', ATENDIDA: 'ATTENDED',
  CANCELADA: 'CANCELLED', PROGRAMADO: 'SCHEDULED', EN_VUELO: 'IN_FLIGHT', ATERRIZADO: 'LANDED', CANCELADO: 'CANCELLED',
  ECONOMICA: 'ECONOMY', EJECUTIVA: 'BUSINESS', PRIMERA: 'FIRST', PILOTO: 'PILOT', COPILOTO: 'COPILOT',
};

const fr: Dictionary = {
  Tienda: 'Boutique', Biblioteca: 'Bibliothèque', Universidad: 'Université', Hospital: 'Hôpital', Aerolínea: 'Compagnie aérienne', Streaming: 'Streaming',
  cliente: 'client', pedido: 'commande', producto: 'produit', categoria: 'categorie', proveedor: 'fournisseur', empleado: 'employe',
  envio: 'expedition', socio: 'adherent', libro: 'livre', autor: 'auteur', editorial: 'editeur', ejemplar: 'exemplaire', prestamo: 'pret',
  genero: 'genre', estudiante: 'etudiant', curso: 'cours', profesor: 'professeur', departamento: 'departement', aula: 'salle',
  carrera: 'filiere', paciente: 'patient', medico: 'medecin', especialidad: 'specialite', cita: 'rendez_vous', medicamento: 'medicament',
  habitacion: 'chambre', aeropuerto: 'aeroport', vuelo: 'vol', avion: 'avion', pasajero: 'passager', reserva: 'reservation',
  tripulante: 'membre_equipage', usuario: 'utilisateur', plan: 'formule', suscripcion: 'abonnement', pelicula: 'film', actor: 'acteur', resena: 'critique',
  nombre: 'nom', apellido: 'prenom', email: 'email', telefono: 'telephone', creado_en: 'cree_le', fecha: 'date_saisie', estado: 'statut',
  total: 'total', sku: 'sku', precio: 'prix', stock: 'stock', descripcion: 'description', pais: 'pays', fecha_ingreso: 'date_embauche',
  direccion: 'adresse', ciudad: 'ville', fecha_envio: 'date_envoi', cantidad: 'quantite', precio_unitario: 'prix_unitaire', costo: 'cout',
  fecha_alta: 'date_adhesion', titulo: 'titre', isbn: 'isbn', anio_publicacion: 'annee_publication', codigo: 'code',
  fecha_prestamo: 'date_pret', fecha_devolucion: 'date_retour', fecha_nacimiento: 'date_naissance', creditos: 'credits', edificio: 'batiment',
  capacidad: 'capacite', duracion_semestres: 'semestres', periodo: 'periode', nota: 'note', grupo_sanguineo: 'groupe_sanguin',
  licencia: 'licence', fecha_hora: 'date_heure', motivo: 'motif', presentacion: 'presentation', numero: 'numero', piso: 'etage',
  disponible: 'disponible', dosis: 'dose', dias: 'jours', codigo_iata: 'code_iata', salida: 'depart', llegada: 'arrivee',
  matricula: 'immatriculation', modelo: 'modele', pasaporte: 'passeport', creada_en: 'creee_le', asiento: 'siege', clase: 'classe',
  cargo: 'poste', fecha_registro: 'date_inscription', precio_mensual: 'prix_mensuel', pantallas: 'ecrans', inicio: 'debut',
  fin: 'fin', activa: 'active', duracion_minutos: 'duree_minutes', anio: 'annee', puntuacion: 'note_sur_cinq',
  comentario: 'commentaire', personaje: 'personnage',
  realiza: 'passe', detalle: 'ligne_commande', clasifica: 'classe_dans', suministra: 'fournit', atiende: 'traite', se_envia: 'expedie',
  supervisa: 'encadre', escribe: 'ecrit', publica: 'publie', tiene: 'possede', solicita: 'emprunte', se_presta: 'est_prete',
  agrupa: 'regroupe', inscripcion: 'inscription', dicta: 'enseigne', adscribe: 'rattache', aloja: 'accueille', cursa: 'suit', ofrece: 'propose',
  prerrequisito: 'prerequis', agenda: 'prend', receta: 'ordonnance', hospeda: 'heberge', sale_de: 'part_de',
  llega_a: 'arrive_a', opera: 'opere', hace: 'effectue', incluye: 'comprend', asignacion: 'affectation', contrata: 'souscrit',
  define: 'definit', pertenece: 'appartient', reparto: 'distribution', recibe: 'recoit',
  jefe: 'chef', subordinado: 'subordonne', requisito: 'prerequis', origen: 'origine', destino: 'destination',
  PENDIENTE: 'EN_ATTENTE', PAGADO: 'PAYEE', ENVIADO: 'EXPEDIEE', ENTREGADO: 'LIVREE', DISPONIBLE: 'DISPONIBLE', PRESTADO: 'PRETE',
  DANADO: 'ABIME', AUXILIAR: 'ASSISTANT', ASOCIADO: 'MAITRE_CONF', TITULAR: 'TITULAIRE', PROGRAMADA: 'PREVU', ATENDIDA: 'EFFECTUE',
  CANCELADA: 'ANNULE', PROGRAMADO: 'PREVU', EN_VUELO: 'EN_VOL', ATERRIZADO: 'ATTERRI', CANCELADO: 'ANNULE',
  ECONOMICA: 'ECONOMIQUE', EJECUTIVA: 'AFFAIRES', PRIMERA: 'PREMIERE', PILOTO: 'PILOTE', COPILOTO: 'COPILOTE',
};

const pt: Dictionary = {
  Tienda: 'Loja', Biblioteca: 'Biblioteca', Universidad: 'Universidade', Hospital: 'Hospital', Aerolínea: 'Companhia aérea', Streaming: 'Streaming',
  cliente: 'cliente', pedido: 'pedido', producto: 'produto', categoria: 'categoria', proveedor: 'fornecedor', empleado: 'funcionario',
  envio: 'envio', socio: 'socio', libro: 'livro', autor: 'autor', editorial: 'editora', ejemplar: 'exemplar', prestamo: 'emprestimo',
  genero: 'genero', estudiante: 'estudante', curso: 'disciplina', profesor: 'professor', departamento: 'departamento', aula: 'sala',
  carrera: 'graduacao', paciente: 'paciente', medico: 'medico', especialidad: 'especialidade', cita: 'consulta', medicamento: 'medicamento',
  habitacion: 'quarto', aeropuerto: 'aeroporto', vuelo: 'voo', avion: 'aeronave', pasajero: 'passageiro', reserva: 'reserva',
  tripulante: 'tripulante', usuario: 'usuario', plan: 'plano', suscripcion: 'assinatura', pelicula: 'filme', actor: 'ator', resena: 'avaliacao',
  nombre: 'nome', apellido: 'sobrenome', email: 'email', telefono: 'telefone', creado_en: 'criado_em', fecha: 'data_registro', estado: 'status',
  total: 'total', sku: 'sku', precio: 'preco', stock: 'estoque', descripcion: 'descricao', pais: 'pais', fecha_ingreso: 'data_admissao',
  direccion: 'endereco', ciudad: 'cidade', fecha_envio: 'data_envio', cantidad: 'quantidade', precio_unitario: 'preco_unitario', costo: 'custo',
  fecha_alta: 'data_adesao', titulo: 'titulo', isbn: 'isbn', anio_publicacion: 'ano_publicacao', codigo: 'codigo',
  fecha_prestamo: 'data_emprestimo', fecha_devolucion: 'data_devolucao', fecha_nacimiento: 'data_nascimento', creditos: 'creditos', edificio: 'predio',
  capacidad: 'capacidade', duracion_semestres: 'semestres', periodo: 'periodo', nota: 'nota', grupo_sanguineo: 'tipo_sanguineo',
  licencia: 'registro_profissional', fecha_hora: 'data_hora', motivo: 'motivo', presentacion: 'apresentacao', numero: 'numero', piso: 'andar',
  disponible: 'disponivel', dosis: 'dose', dias: 'dias', codigo_iata: 'codigo_iata', salida: 'partida', llegada: 'chegada',
  matricula: 'matricula', modelo: 'modelo', pasaporte: 'passaporte', creada_en: 'criada_em', asiento: 'assento', clase: 'classe',
  cargo: 'cargo', fecha_registro: 'data_cadastro', precio_mensual: 'preco_mensal', pantallas: 'telas', inicio: 'inicio',
  fin: 'fim', activa: 'ativa', duracion_minutos: 'duracao_minutos', anio: 'ano', puntuacion: 'pontuacao',
  comentario: 'comentario', personaje: 'personagem',
  realiza: 'faz', detalle: 'item_pedido', clasifica: 'classifica', suministra: 'fornece', atiende: 'atende', se_envia: 'e_enviado',
  supervisa: 'supervisiona', escribe: 'escreve', publica: 'publica', tiene: 'tem', solicita: 'solicita', se_presta: 'e_emprestado',
  agrupa: 'agrupa', inscripcion: 'matricula_disciplina', dicta: 'leciona', adscribe: 'vincula', aloja: 'abriga', cursa: 'cursa', ofrece: 'oferece',
  prerrequisito: 'pre_requisito', agenda: 'agenda', receta: 'receita', hospeda: 'hospeda', sale_de: 'parte_de',
  llega_a: 'chega_a', opera: 'opera', hace: 'faz_reserva', incluye: 'inclui', asignacion: 'escala', contrata: 'contrata',
  define: 'define', pertenece: 'pertence', reparto: 'elenco', recibe: 'recebe',
  jefe: 'chefe', subordinado: 'subordinado', requisito: 'requisito', origen: 'origem', destino: 'destino',
  PENDIENTE: 'PENDENTE', PAGADO: 'PAGO', ENVIADO: 'ENVIADO', ENTREGADO: 'ENTREGUE', DISPONIBLE: 'DISPONIVEL', PRESTADO: 'EMPRESTADO',
  DANADO: 'DANIFICADO', AUXILIAR: 'AUXILIAR', ASOCIADO: 'ASSOCIADO', TITULAR: 'TITULAR', PROGRAMADA: 'AGENDADA', ATENDIDA: 'REALIZADA',
  CANCELADA: 'CANCELADA', PROGRAMADO: 'PROGRAMADO', EN_VUELO: 'EM_VOO', ATERRIZADO: 'POUSOU', CANCELADO: 'CANCELADO',
  ECONOMICA: 'ECONOMICA', EJECUTIVA: 'EXECUTIVA', PRIMERA: 'PRIMEIRA', PILOTO: 'PILOTO', COPILOTO: 'COPILOTO',
};

const DICTIONARIES: Partial<Record<Locale, Dictionary>> = { en, fr, pt };

/** The name in the chosen language; Spanish, and any word without a translation, stay as written. */
export const localName = (locale: Locale, name: string) => DICTIONARIES[locale]?.[name] ?? name;

/** Table names in plural, the usual convention for tables. FK columns keep the singular (cliente_id). */
const PLURALS: Record<Locale, Dictionary> = {
  es: {
    cliente: 'clientes', pedido: 'pedidos', producto: 'productos', categoria: 'categorias', proveedor: 'proveedores', empleado: 'empleados',
    envio: 'envios', socio: 'socios', libro: 'libros', autor: 'autores', editorial: 'editoriales', ejemplar: 'ejemplares', prestamo: 'prestamos',
    genero: 'generos', estudiante: 'estudiantes', curso: 'cursos', profesor: 'profesores', departamento: 'departamentos', aula: 'aulas',
    carrera: 'carreras', paciente: 'pacientes', medico: 'medicos', especialidad: 'especialidades', cita: 'citas', medicamento: 'medicamentos',
    habitacion: 'habitaciones', aeropuerto: 'aeropuertos', vuelo: 'vuelos', avion: 'aviones', pasajero: 'pasajeros', reserva: 'reservas',
    tripulante: 'tripulantes', usuario: 'usuarios', plan: 'planes', suscripcion: 'suscripciones', pelicula: 'peliculas', actor: 'actores', resena: 'resenas',
  },
  en: {
    cliente: 'customers', pedido: 'orders', producto: 'products', categoria: 'categories', proveedor: 'suppliers', empleado: 'employees',
    envio: 'shipments', socio: 'members', libro: 'books', autor: 'authors', editorial: 'publishers', ejemplar: 'book_copies', prestamo: 'loans',
    genero: 'genres', estudiante: 'students', curso: 'courses', profesor: 'teachers', departamento: 'departments', aula: 'classrooms',
    carrera: 'degrees', paciente: 'patients', medico: 'doctors', especialidad: 'specialties', cita: 'appointments', medicamento: 'medicines',
    habitacion: 'rooms', aeropuerto: 'airports', vuelo: 'flights', avion: 'aircraft', pasajero: 'passengers', reserva: 'bookings',
    tripulante: 'crew_members', usuario: 'users', plan: 'plans', suscripcion: 'subscriptions', pelicula: 'movies', actor: 'actors', resena: 'reviews',
  },
  fr: {
    cliente: 'clients', pedido: 'commandes', producto: 'produits', categoria: 'categories', proveedor: 'fournisseurs', empleado: 'employes',
    envio: 'expeditions', socio: 'adherents', libro: 'livres', autor: 'auteurs', editorial: 'editeurs', ejemplar: 'exemplaires', prestamo: 'prets',
    genero: 'genres', estudiante: 'etudiants', curso: 'cours', profesor: 'professeurs', departamento: 'departements', aula: 'salles',
    carrera: 'filieres', paciente: 'patients', medico: 'medecins', especialidad: 'specialites', cita: 'rendez_vous', medicamento: 'medicaments',
    habitacion: 'chambres', aeropuerto: 'aeroports', vuelo: 'vols', avion: 'avions', pasajero: 'passagers', reserva: 'reservations',
    tripulante: 'membres_equipage', usuario: 'utilisateurs', plan: 'formules', suscripcion: 'abonnements', pelicula: 'films', actor: 'acteurs', resena: 'critiques',
  },
  pt: {
    cliente: 'clientes', pedido: 'pedidos', producto: 'produtos', categoria: 'categorias', proveedor: 'fornecedores', empleado: 'funcionarios',
    envio: 'envios', socio: 'socios', libro: 'livros', autor: 'autores', editorial: 'editoras', ejemplar: 'exemplares', prestamo: 'emprestimos',
    genero: 'generos', estudiante: 'estudantes', curso: 'disciplinas', profesor: 'professores', departamento: 'departamentos', aula: 'salas',
    carrera: 'graduacoes', paciente: 'pacientes', medico: 'medicos', especialidad: 'especialidades', cita: 'consultas', medicamento: 'medicamentos',
    habitacion: 'quartos', aeropuerto: 'aeroportos', vuelo: 'voos', avion: 'aeronaves', pasajero: 'passageiros', reserva: 'reservas',
    tripulante: 'tripulantes', usuario: 'usuarios', plan: 'planos', suscripcion: 'assinaturas', pelicula: 'filmes', actor: 'atores', resena: 'avaliacoes',
  },
};

export const tableName = (locale: Locale, name: string) => PLURALS[locale][name] ?? localName(locale, name);
