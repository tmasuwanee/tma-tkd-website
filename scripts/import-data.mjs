import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

// Import leads
const leadsSQL = `INSERT IGNORE INTO \`leads\` (\`id\`, \`parentName\`, \`kidName\`, \`kidAge\`, \`programInterest\`, \`motivation\`, \`email\`, \`phone\`, \`additionalNotes\`, \`createdAt\`, \`updatedAt\`) VALUES
  (1, 'Arfa', 'Test Child', '13-17', 'kickboxing', 'self-defense', 'arfamoisia1@gmail.com', '4044325858', 'test', '2026-03-05 20:58:09', '2026-03-05 20:58:09'),
  (30001, 'Test Parent', 'Test Child', '7-12', 'taekwondo', NULL, 'test@example.com', '(555) 555-5555', NULL, '2026-03-10 14:17:16', '2026-03-10 14:17:16'),
  (60001, 'Joshua Pruitt', 'Oliver ', '4-6', 'taekwondo', 'confidence', 'jkpruitt424@gmail.com', '4703342357', 'My son is 3 but will be 4 in May. Interested in the little tiger program but it was not an option to select', '2026-03-24 21:20:21', '2026-03-24 21:20:21'),
  (90001, 'Anni', 'Theo', '4-6', 'kickboxing', 'self-defense', 'xjjangax@aol.com', '+6785751147', NULL, '2026-03-27 03:07:46', '2026-03-27 03:07:46'),
  (120001, 'Steven Kim', 'Hezi', '7-12', 'taekwondo', 'confidence', 'steven.wc.kim@gmail.com', '6786509394', NULL, '2026-04-17 02:35:31', '2026-04-17 02:35:31'),
  (150001, 'Andrea Torres', 'Valentina Rodriguez ', '4-6', 'kickboxing', 'self-defense', 'andreita_0304@yahoo.com', '4079284764', NULL, '2026-04-20 17:06:33', '2026-04-20 17:06:33'),
  (180001, 'Rami calis', 'Andrew ', '13-17', 'kickboxing', 'fitness', 'gadshu@hotmail.com', '6787800503', 'Can my other son try too?', '2026-04-23 21:21:03', '2026-04-23 21:21:03'),
  (180002, 'Rami calis', 'Luke', '13-17', 'kickboxing', 'fitness', 'gadshu@hotmail.com', '6787800503', NULL, '2026-04-23 21:21:42', '2026-04-23 21:21:42')`;

console.log('Importing leads...');
await connection.query(leadsSQL);
const [leadsCount] = await connection.query('SELECT COUNT(*) as cnt FROM leads');
console.log('Leads imported:', leadsCount[0].cnt);

// Read and import camp registrations from the SQL file
const sqlFile = readFileSync('/home/ubuntu/upload/tma_database_export.sql', 'utf8');

// Extract the campRegistrations INSERT statement
const campMatch = sqlFile.match(/INSERT INTO `campRegistrations`[^;]+;/s);
if (!campMatch) {
  console.error('Could not find campRegistrations INSERT in SQL file');
  process.exit(1);
}

// Fix timestamp format: 'YYYY-MM-DDTHH:MM:SS' -> 'YYYY-MM-DD HH:MM:SS'
let campSQL = campMatch[0].replace(/'(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})'/g, "'$1 $2'");

// Replace INSERT INTO with INSERT IGNORE INTO
campSQL = campSQL.replace('INSERT INTO', 'INSERT IGNORE INTO');

console.log('Importing camp registrations...');
await connection.query(campSQL);
const [campCount] = await connection.query('SELECT COUNT(*) as cnt FROM campRegistrations');
console.log('Camp registrations imported:', campCount[0].cnt);

await connection.end();
console.log('Import complete!');
