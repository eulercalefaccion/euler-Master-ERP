const admin = require('firebase-admin');
const fs = require('fs');

// IMPORTANT: Set GOOGLE_APPLICATION_CREDENTIALS before running this script
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Please set GOOGLE_APPLICATION_CREDENTIALS environment variable.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function cleanup() {
  const args = process.argv.slice(2);
  const deleteMode = args.includes('--delete');

  console.log(`Starting cleanup scan... Mode: ${deleteMode ? 'DELETE' : 'DRY-RUN'}`);

  const collectionsToScan = ['clientes', 'presupuestos'];
  const testKeywords = ['probando', 'test'];

  for (const collName of collectionsToScan) {
    console.log(`\nScanning collection: ${collName}`);
    const snapshot = await db.collection(collName).get();
    let foundCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const name = (data.name || data.clientName || '').toLowerCase();
      const isDeleted = data.deleted === true;

      if (!isDeleted && testKeywords.some(kw => name.includes(kw))) {
        foundCount++;
        console.log(`- Found [${doc.id}]: ${data.name || data.clientName}`);

        if (deleteMode) {
          await db.collection(collName).doc(doc.id).update({ deleted: true });
          console.log(`  -> Marked as deleted.`);
        }
      }
    }

    if (foundCount === 0) {
      console.log('No test records found.');
    } else {
      console.log(`Total test records found in ${collName}: ${foundCount}`);
    }
  }

  if (!deleteMode) {
    console.log("\nRun with --delete flag to actually mark these records as deleted (soft delete).");
  }
}

cleanup().catch(console.error);
