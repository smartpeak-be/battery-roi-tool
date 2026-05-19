'use strict';

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Firestore-trigger: when a project photo-doc is written with
 * tag='serial', run Cloud Vision OCR and append a serial entry to
 * project.serialNumbers. Cleanup on retag serial -> situatie.
 *
 * Region: europe-west1 (same as Firestore/Storage).
 */
exports.ocrSerial = functions.firestore
  .onDocumentWritten(
    { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
    async (event) => {
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;
      const { projectId, photoId } = event.params;
      console.log('ocrSerial fired', { projectId, photoId,
        beforeTag: before?.tag, afterTag: after?.tag });
      // Logic added in Task 6.
    },
  );
