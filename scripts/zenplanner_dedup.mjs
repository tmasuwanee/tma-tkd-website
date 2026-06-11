/**
 * ZenPlanner dedup script
 * Run: node scripts/zenplanner_dedup.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const zenplannerRaw = [
  ["kori Adams","4042745413","marquitis@gmail.com"],
  ["Liam Adams","4042745413","marquitis@gmail.com"],
  ["Emerald Akofu","16419805076","ifangkaroll@yahoo.com"],
  ["Neeya Alhassan","2629039311","rrcizek@gmail.com"],
  ["Jordan Barnett","17703374588","jbarnett14@liberty.edu"],
  ["Vita Brown Redmond","16787794758","vita.redmond@gmail.com"],
  ["Tatiana Florez Carrillo","14405474037","florez0415@gmail.com"],
  ["Daniel Choe","6789977450","cheerfulggg5@gmail.com"],
  ["David Choe","16789977450","cheerfulggg5@gmail.com"],
  ["Demian Choi","17705477780","missioninhs@gmail.com"],
  ["Ria Chowdhury","14044830771","mahi0311@gmail.com"],
  ["Hayoung Chung","16179397873","4mytears@gmail.com"],
  ["Dahila Cugny","6788363257","olivier.cugny@gmail.com"],
  ["Gabriel Cugny","6788363257","olivier.cugny@gmail.com"],
  ["Nancy Esfahani","14702273492","nancyesfahani@gmail.com"],
  ["Matthew Eskew","14047458747","meskew.kci@gmail.com"],
  ["Kemit Finch","7702869158","efinch09@gmail.com"],
  ["Saniyah Finch","7702869158","efinch09@gmail.com"],
  ["ISAAC GAO","14045806379","sanchezclaudia1116@yahoo.com"],
  ["Valentyna Grenchuk","14708004737","valentynagrenchuk@gmail.com"],
  ["Nina Harris","14049572893","pwaters1214@gmail.com"],
  ["lungele Itongwa","17705275411","york.itongwa@yahoo.com"],
  ["Aaron Jackson","6785425553","alia.jackson@adp.com"],
  ["Bryce Jamison","8033787995",""],
  ["Aron Jones","4042340492",""],
  ["Aiza Khan","18186051523","qadrin@gmail.com"],
  ["Zayn Khan","8186051523","qadrin@gmail.com"],
  ["Elikem Ladzekpo","5102824393","lynncaulker@gmail.com"],
  ["Kekeli Ladzekpo","15102824393","lynncaulker@gmail.com"],
  ["Cayden Lee","4045186621","swtppoppo@gmail.com"],
  ["Nathan Lee","14043942323","leemics01@gmail.com"],
  ["Siwoo Lee","4044090867","jakyung@msn.com"],
  ["Bonnie Lunceford","4049064154","jenninl83@yahoo.com"],
  ["Oluwademilade Makinde","16788588283","smilingpeju@gmail.com"],
  ["Ismael Maldonado","16786519599","mariselapuerta3@gmail.com"],
  ["Lucia Maldonado","16786519599","mariselapuerta3@gmail.com"],
  ["Kaydan Martin","3363402418","martindemetria@aol.com"],
  ["Rohan Martin","3363402418","martindemetria@aol.com"],
  ["Victoria Matos","16787552604","loinymatos@outlook.com"],
  ["Atticus Mcaleer","16784725440","kimberlymcaleer@gmail.com"],
  ["Charlotte McNulty","2514903885",""],
  ["Ellen McNulty","2514903885","sidavidson0308@live.com"],
  ["Kashton Mutcherson","14044009621","dcsadawson@gmail.com"],
  ["Grace Nguena","7703174077","gnguena@hotmail.com"],
  ["Isaac Nguyen","16785599123","ashlynn_penna@yahoo.com"],
  ["Isaiah Nguyen","16785599123","ashlynn_penna@yahoo.com"],
  ["William Nguyen","4045803604","thumannguyen06_08@gmail.com"],
  ["Irayma Ocoro","16783961314","iraymaoc@gmail.com"],
  ["Lennon Oneal","16788639932","cynthiamichelle1411@gmail.com"],
  ["Aiden Park","4045579431","andypark0223@gmail.com"],
  ["Brayden Park","14045579431","andypark0223@gmail.com"],
  ["Delfino Perez","14049572455","delfinoperezmazariegos@gmail.com"],
  ["Ayden Pinnon","14042792364","gironemis@gmail.com"],
  ["Rafael Quiroz","17063072594","rafaelquiroz70@yahoo.com"],
  ["Camren Ramdas","6318048630","cramdas31@gmail.com"],
  ["Nohely Ramirez","16789517927","nohelyrs.90@gmail.com"],
  ["Aidan Rampey","3018013913","justinrampey@gmail.com"],
  ["Abigail Regan","18635129200","billyregantsm@gmail.com"],
  ["Emmett Regan","8635129200","billyregantsm@gmail.com"],
  ["Kayla Rios-Lara","16786653941","mariia.lara16@gmail.com"],
  ["Shivnarain Rishikesh","14047895475","radsengineer@gmail.com"],
  ["Tarkin Roberts","17708072094","cmroberts1982@gmail.com"],
  ["Rosa Rubio","17025025906","rosarubio0408@gmail.com"],
  ["Kylie Sanderson","6787575825","kendle357@gmail.com"],
  ["Andrew Shearon","16782349680","krystal.shearon@gmail.com"],
  ["Ellie Shearon","6782459680",""],
  ["Roman Shelkornik","4045611103",""],
  ["Michaela Shelley","17734080095","Flemingmichaela91@gmail.com"],
  ["Johnathan Shramek","14044570741","michellekshramek@outlook.com"],
  ["Dylan Sneed","17709065950","llove2read@hotmail.com"],
  ["Micah Spear","4705156817",""],
  ["Nimrita Tamang","14047176096","nimrita.tamang@gmail.com"],
  ["Phillip Trower","14049188366","leilly1003@gmail.com"],
  ["Maria Useche","6786873386","betsy.andrade@gmail.com"],
  ["Renesha W","4042184353",""],
  ["Tanya Wei","4045283807","meiteng545wei@gmail.com"],
  ["Rhys White","4045835955","snw12674@hotmail.com"],
  ["Aniessa Whittaker","4104913849","montwhit29@gmail.com"],
  ["Jackson Willis","4042476396","asbcmitchell1@gmail.com"],
  ["Micah Wooten","16785468816","cheryl.wooten0923@gmail.com"],
  ["Iris Yu","14045283807","meiling545wei@gmail.com"],
];

function normalizePhone(p) {
  let d = String(p).replace(/[^0-9]/g, '');
  if (d.startsWith('1') && d.length === 11) d = d.slice(1);
  return d.slice(-10);
}
function normalizeEmail(e) { return (e||'').trim().toLowerCase(); }

// Deduplicate by email family (siblings share same email — keep one row per email)
const seenKeys = new Set();
const zpDeduped = [];
for (const [name, phone, email] of zenplannerRaw) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  const key = e || p;
  if (key && !seenKeys.has(key)) {
    seenKeys.add(key);
    zpDeduped.push({ name, phone, email: e, phone10: p });
  }
}
console.log(`ZenPlanner unique families: ${zpDeduped.length}`);

const dbUrl = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port) || 4000,
  user: dbUrl.username,
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  connectTimeout: 20000,
});

const [leadRows] = await conn.execute(
  `SELECT id, LOWER(email) as email, REGEXP_REPLACE(phone, '[^0-9]', '') as phone_digits, parentName, programInterest, pipelineStage FROM leads WHERE email IS NOT NULL AND email != ''`
);
const [enrolledRows] = await conn.execute(
  `SELECT LOWER(email) as email FROM campRegistrations WHERE email IS NOT NULL AND email != '' AND email NOT LIKE '%test%' AND email NOT LIKE '%arfa%' AND email NOT LIKE '%tmasuwanee%'`
);
await conn.end();

const leadByEmail = new Map();
const leadByPhone = new Map();
for (const row of leadRows) {
  const p10 = String(row.phone_digits||'').slice(-10);
  if (row.email) leadByEmail.set(row.email, row);
  if (p10) leadByPhone.set(p10, row);
}
const enrolledSet = new Set(enrolledRows.map(r => r.email));
console.log(`Leads in DB: ${leadByEmail.size}, Enrolled: ${enrolledSet.size}`);

const newLeads = [], existingLeads = [], alreadyEnrolled = [], noEmail = [];

for (const { name, phone, email, phone10 } of zpDeduped) {
  if (email && enrolledSet.has(email)) {
    alreadyEnrolled.push({ name, email, phone, matchType: 'email' }); continue;
  }
  const byEmail = email ? leadByEmail.get(email) : null;
  const byPhone = phone10 ? leadByPhone.get(phone10) : null;
  const match = byEmail || byPhone;
  if (match) {
    existingLeads.push({ name, email, phone, matchType: byEmail ? 'email' : 'phone', leadId: match.id, programInterest: match.programInterest, pipelineStage: match.pipelineStage });
  } else if (email) {
    newLeads.push({ name, email, phone });
  } else {
    noEmail.push({ name, phone });
  }
}

function toCsv(rows, headers) {
  return [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
}

writeFileSync('/home/ubuntu/zenplanner_new.csv', toCsv(newLeads, ['name','email','phone']));
writeFileSync('/home/ubuntu/zenplanner_existing_leads.csv', toCsv(existingLeads, ['name','email','phone','matchType','leadId','programInterest','pipelineStage']));
writeFileSync('/home/ubuntu/zenplanner_already_enrolled.csv', toCsv(alreadyEnrolled, ['name','email','phone','matchType']));

console.log('\n=== RESULTS ===');
console.log(`New (safe to import + send):     ${newLeads.length}`);
console.log(`Existing leads (enqueue only):   ${existingLeads.length}`);
console.log(`Already enrolled (EXCLUDE):      ${alreadyEnrolled.length}`);
console.log(`No email (call only):            ${noEmail.length}`);
console.log('\n--- New leads ---');
newLeads.forEach(r => console.log(`  ${r.name} | ${r.email} | ${r.phone}`));
console.log('\n--- Existing leads ---');
existingLeads.forEach(r => console.log(`  ${r.name} | ${r.email} | match=${r.matchType} lead_id=${r.leadId} stage=${r.pipelineStage}`));
console.log('\n--- Already enrolled (SKIP) ---');
alreadyEnrolled.forEach(r => console.log(`  ${r.name} | ${r.email}`));
console.log('\n--- No email (call only) ---');
noEmail.forEach(r => console.log(`  ${r.name} | ${r.phone}`));
