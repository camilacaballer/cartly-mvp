import Airtable from 'airtable';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = process.env.USERS_TABLE_NAME|| 'Usuarios';

if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
  throw new Error('Missing Airtable credentials (AIRTABLE_PAT, AIRTABLE_BASE_ID)');
}

export const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID);

export async function findUserByPhone(telefono) {
  if (!telefono) return null;
  const tel = String(telefono).trim().toLowerCase();
  const formula = `LOWER({telefono}) = '${tel.replace(/'/g, "''")}'`;
  const records = await base(AIRTABLE_USERS_TABLE)
    .select({
      maxRecords: 1,
      filterByFormula: formula
    })
    .all();
  return records[0] || null;
}

export async function createUser({ nombre, telefono, passwordHash }) {
  const [record] = await base(AIRTABLE_USERS_TABLE).create([
    {
      fields: {
        nombre,
        telefono,
        password_hash: passwordHash
      }
    }
  ]);
  return record;
}


