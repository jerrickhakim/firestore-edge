/**
 * Firebase Admin SDK-style wrapper for custom Firestore REST API
 * Provides the same syntax and responses as Firebase Admin SDK
 */

import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccount {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

const serviceAccount: ServiceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;

// Token cache to avoid regenerating on every request
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Sign a JWT using jose library (WebCrypto compatible)
 * This works in workflow runtime environments
 */
async function signJwt(payload: object, privateKey: string): Promise<string> {
  // Import the private key
  const key = await importPKCS8(privateKey, "RS256");

  // Create and sign the JWT
  const jwt = await new SignJWT(payload as any).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(key);

  return jwt;
}

/**
 * Get OAuth2 access token from service account credentials
 * Service account properties should be in individual FIREBASE_* env vars
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Invalid service account credentials");
  }

  // Create JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore",
  };

  // Sign JWT using jose (WebCrypto compatible)
  const jwt = await signJwt(payload, serviceAccount.private_key);

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  // Cache the token
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Sentinel value for server timestamp
 */
const SERVER_TIMESTAMP_SENTINEL = Symbol("SERVER_TIMESTAMP");

/**
 * Sentinel value for field deletion
 */
const DELETE_FIELD_SENTINEL = Symbol("DELETE_FIELD");

/**
 * Sentinel value for increment
 */
class IncrementValue {
  constructor(public operand: number) {}
}

/**
 * Sentinel value for array union
 */
class ArrayUnionValue {
  constructor(public elements: any[]) {}
}

/**
 * Sentinel value for array remove
 */
class ArrayRemoveValue {
  constructor(public elements: any[]) {}
}

/**
 * Firestore Timestamp class
 */
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}

  static now(): Timestamp {
    const now = Date.now();
    return new Timestamp(Math.floor(now / 1000), (now % 1000) * 1000000);
  }

  static fromDate(date: Date): Timestamp {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }

  static fromMillis(milliseconds: number): Timestamp {
    return new Timestamp(Math.floor(milliseconds / 1000), (milliseconds % 1000) * 1000000);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }

  isEqual(other: Timestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds;
  }

  valueOf(): string {
    return `Timestamp(seconds=${this.seconds}, nanoseconds=${this.nanoseconds})`;
  }
}

/**
 * GeoPoint class for geographic coordinates
 */
export class GeoPoint {
  constructor(public latitude: number, public longitude: number) {
    if (latitude < -90 || latitude > 90) {
      throw new Error("Latitude must be between -90 and 90");
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error("Longitude must be between -180 and 180");
    }
  }

  isEqual(other: GeoPoint): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }
}

/**
 * FieldPath class for field paths
 */
export class FieldPath {
  private segments: string[];

  constructor(...segments: string[]) {
    this.segments = segments;
  }

  static documentId(): FieldPath {
    return new FieldPath("__name__");
  }

  isEqual(other: FieldPath): boolean {
    return JSON.stringify(this.segments) === JSON.stringify(other.segments);
  }
}

/**
 * FieldValue class for special Firestore values
 */
export class FieldValue {
  private constructor() {}

  static serverTimestamp(): any {
    return SERVER_TIMESTAMP_SENTINEL;
  }

  static delete(): any {
    return DELETE_FIELD_SENTINEL;
  }

  static increment(n: number): any {
    return new IncrementValue(n);
  }

  static arrayUnion(...elements: any[]): any {
    return new ArrayUnionValue(elements);
  }

  static arrayRemove(...elements: any[]): any {
    return new ArrayRemoveValue(elements);
  }
}

/**
 * AggregateField class for aggregate queries
 */
export class AggregateField {
  private constructor(public aggregateType: "count" | "sum" | "avg", public fieldPath?: string) {}

  static count(): AggregateField {
    return new AggregateField("count");
  }

  static sum(field: string): AggregateField {
    return new AggregateField("sum", field);
  }

  static average(field: string): AggregateField {
    return new AggregateField("avg", field);
  }
}

/**
 * Convert JavaScript values to Firestore field format
 */
function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  // Handle sentinel values
  if (value === SERVER_TIMESTAMP_SENTINEL) {
    return { timestampValue: new Date().toISOString() };
  }

  if (value === DELETE_FIELD_SENTINEL) {
    return null; // Will be handled specially in transforms
  }

  if (value instanceof IncrementValue) {
    return { integerValue: value.operand.toString() }; // Transform will handle this
  }

  if (value instanceof ArrayUnionValue) {
    return {
      arrayValue: {
        values: value.elements.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (value instanceof ArrayRemoveValue) {
    return {
      arrayValue: {
        values: value.elements.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (value instanceof Timestamp) {
    const date = value.toDate();
    return { timestampValue: date.toISOString() };
  }

  if (value instanceof GeoPoint) {
    return {
      geoPointValue: {
        latitude: value.latitude,
        longitude: value.longitude,
      },
    };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    // Firestore distinguishes between integers and doubles
    if (Number.isInteger(value) && value >= -9007199254740991 && value <= 9007199254740991) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (typeof value === "object") {
    const fields: any = {};
    for (const [key, val] of Object.entries(value)) {
      fields[key] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }

  throw new Error(`Unsupported value type: ${typeof value}`);
}

/**
 * Convert Firestore field format to JavaScript values
 */
function fromFirestoreValue(field: any): any {
  if (!field) return null;

  if (field.nullValue !== undefined) return null;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.integerValue !== undefined) return parseInt(field.integerValue, 10);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.stringValue !== undefined) return field.stringValue;

  if (field.timestampValue !== undefined) {
    const date = new Date(field.timestampValue);
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }

  if (field.arrayValue) {
    return field.arrayValue.values?.map((v: any) => fromFirestoreValue(v)) || [];
  }

  if (field.mapValue) {
    const result: any = {};
    for (const [key, value] of Object.entries(field.mapValue.fields || {})) {
      result[key] = fromFirestoreValue(value);
    }
    return result;
  }

  if (field.geoPointValue) {
    return new GeoPoint(field.geoPointValue.latitude, field.geoPointValue.longitude);
  }

  if (field.referenceValue) {
    return field.referenceValue;
  }

  return field;
}

/**
 * Get a single Firestore document using REST API
 */
async function getDocument(collection: string, docId: string) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.text();
    throw new Error(`Failed to get document: ${error}`);
  }

  const doc = (await response.json()) as { name: string; fields?: any };

  const result: any = { id: doc.name.split("/").pop() };
  for (const [key, value] of Object.entries(doc.fields || {})) {
    result[key] = fromFirestoreValue(value);
  }

  return result;
}

/**
 * Update a Firestore document using REST API
 */
async function updateDocument(collection: string, docId: string, data: any) {
  const accessToken = await getAccessToken();

  const fields: any = {};
  const transforms: any[] = [];
  const updateMask: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === DELETE_FIELD_SENTINEL) {
      // For delete, just add to updateMask but not to fields
      updateMask.push(key);
      continue;
    }

    if (value === SERVER_TIMESTAMP_SENTINEL) {
      transforms.push({
        fieldPath: key,
        setToServerValue: "REQUEST_TIME",
      });
      continue;
    }

    if (value instanceof IncrementValue) {
      transforms.push({
        fieldPath: key,
        increment: toFirestoreValue(value.operand),
      });
      continue;
    }

    if (value instanceof ArrayUnionValue) {
      transforms.push({
        fieldPath: key,
        appendMissingElements: {
          values: value.elements.map((item) => toFirestoreValue(item)),
        },
      });
      continue;
    }

    if (value instanceof ArrayRemoveValue) {
      transforms.push({
        fieldPath: key,
        removeAllFromArray: {
          values: value.elements.map((item) => toFirestoreValue(item)),
        },
      });
      continue;
    }

    fields[key] = toFirestoreValue(value);
    updateMask.push(key);
  }

  const fieldPaths = updateMask.map(encodeURIComponent).join("&updateMask.fieldPaths=");
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=${fieldPaths}&currentDocument.exists=true`;

  const body: any = { fields };
  if (transforms.length > 0) {
    body.transforms = transforms;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update document: ${error}`);
  }

  return response.json();
}

/**
 * Create a Firestore document using REST API
 */
async function createDocument(collection: string, data: any, docId?: string) {
  const accessToken = await getAccessToken();
  const url = docId
    ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${docId}`
    : `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}`;

  const fields: any = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create document: ${error}`);
  }

  return response.json();
}

/**
 * Set a Firestore document (create or overwrite) using REST API
 */
async function setDocument(collection: string, docId: string, data: any, merge = false) {
  const accessToken = await getAccessToken();

  // If merge is true, use PATCH, otherwise use PUT or create with specific ID
  if (merge) {
    return updateDocument(collection, docId, data);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${docId}`;

  const fields: any = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }

  // Check if document exists first
  const exists = await getDocument(collection, docId);

  if (exists) {
    // Delete and recreate to ensure full overwrite
    await deleteDocument(collection, docId);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set document: ${error}`);
  }

  return response.json();
}

/**
 * Delete a Firestore document using REST API
 */
async function deleteDocument(collection: string, docId: string) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete document: ${error}`);
  }

  return response.ok;
}

/**
 * List documents in a collection using REST API
 */
async function listDocuments(collection: string, pageSize = 100, pageToken?: string) {
  const accessToken = await getAccessToken();
  let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?pageSize=${pageSize}`;

  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list documents: ${error}`);
  }

  const data = (await response.json()) as { documents?: any[]; nextPageToken?: string };

  // Convert Firestore format back to plain objects
  const documents =
    data.documents?.map((doc: any) => {
      const result: any = { id: doc.name.split("/").pop() };
      for (const [key, value] of Object.entries(doc.fields || {})) {
        result[key] = fromFirestoreValue(value);
      }
      return result;
    }) || [];

  return {
    documents,
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Batch get multiple documents
 */
async function batchGetDocuments(documentPaths: string[]) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:batchGet`;

  const documents = documentPaths.map((path) => `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documents }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to batch get documents: ${error}`);
  }

  const results = await response.json();
  return results;
}

/**
 * Commit a batch write
 */
async function commitBatch(writes: any[]) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to commit batch: ${error}`);
  }

  return response.json();
}

/**
 * Begin a transaction
 */
async function beginTransaction(options?: { readOnly?: boolean; readWrite?: any }) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:beginTransaction`;

  const body: any = {};
  if (options?.readOnly) {
    body.options = { readOnly: {} };
  } else if (options?.readWrite) {
    body.options = { readWrite: options.readWrite };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to begin transaction: ${error}`);
  }

  const data = (await response.json()) as { transaction: string };
  return data.transaction;
}

/**
 * Commit a transaction
 */
async function commitTransaction(transaction: string, writes: any[]) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes, transaction }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to commit transaction: ${error}`);
  }

  return response.json();
}

/**
 * Rollback a transaction
 */
async function rollbackTransaction(transaction: string) {
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:rollback`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to rollback transaction: ${error}`);
  }

  return response.json();
}

/**
 * Query documents with filters (basic implementation)
 * For complex queries, use the runQuery endpoint
 */
async function queryDocuments(collection: string, filters: any = {}) {
  const accessToken = await getAccessToken();

  // Parse the collection path to separate parent path from collection ID
  // e.g., "users/userId/repos/repoId/files" -> parent: "users/userId/repos/repoId", collectionId: "files"
  const pathSegments = collection.split("/");
  const collectionId = pathSegments[pathSegments.length - 1];
  const parentPath = pathSegments.slice(0, -1).join("/");

  // Build the URL with parent path if it exists
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const url = parentPath ? `${baseUrl}/${parentPath}:runQuery` : `${baseUrl}:runQuery`;

  const structuredQuery: any = {
    from: [{ collectionId: collectionId, allDescendants: false }],
  };

  // Add where filters if provided
  if (filters.where) {
    structuredQuery.where = filters.where;
  }

  // Add orderBy if provided
  if (filters.orderBy) {
    structuredQuery.orderBy = filters.orderBy;
  }

  // Add limit if provided
  if (filters.limit) {
    structuredQuery.limit = filters.limit;
  }

  // Add offset if provided
  if (filters.offset) {
    structuredQuery.offset = filters.offset;
  }

  // Add startAt cursor if provided
  if (filters.startAt) {
    structuredQuery.startAt = filters.startAt;
  }

  // Add endAt cursor if provided
  if (filters.endAt) {
    structuredQuery.endAt = filters.endAt;
  }

  // Add select (field projection) if provided
  if (filters.select) {
    structuredQuery.select = {
      fields: filters.select.map((field: string) => ({ fieldPath: field })),
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to query documents: ${error}`);
  }

  const results = (await response.json()) as any[];

  return results
    .filter((r: any) => r.document)
    .map((r: any) => {
      const doc = r.document;
      const result: any = { id: doc.name.split("/").pop() };
      for (const [key, value] of Object.entries(doc.fields || {})) {
        result[key] = fromFirestoreValue(value);
      }
      return result;
    });
}

/**
 * Query collection group (all collections with the same ID)
 */
async function queryCollectionGroup(collectionId: string, filters: any = {}) {
  const accessToken = await getAccessToken();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const url = `${baseUrl}:runQuery`;

  const structuredQuery: any = {
    from: [{ collectionId: collectionId, allDescendants: true }],
  };

  // Add where filters if provided
  if (filters.where) {
    structuredQuery.where = filters.where;
  }

  // Add orderBy if provided
  if (filters.orderBy) {
    structuredQuery.orderBy = filters.orderBy;
  }

  // Add limit if provided
  if (filters.limit) {
    structuredQuery.limit = filters.limit;
  }

  // Add offset if provided
  if (filters.offset) {
    structuredQuery.offset = filters.offset;
  }

  // Add startAt cursor if provided
  if (filters.startAt) {
    structuredQuery.startAt = filters.startAt;
  }

  // Add endAt cursor if provided
  if (filters.endAt) {
    structuredQuery.endAt = filters.endAt;
  }

  // Add select (field projection) if provided
  if (filters.select) {
    structuredQuery.select = {
      fields: filters.select.map((field: string) => ({ fieldPath: field })),
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to query collection group: ${error}`);
  }

  const results = (await response.json()) as any[];

  return results
    .filter((r: any) => r.document)
    .map((r: any) => {
      const doc = r.document;
      const result: any = { id: doc.name.split("/").pop() };
      for (const [key, value] of Object.entries(doc.fields || {})) {
        result[key] = fromFirestoreValue(value);
      }
      return result;
    });
}

/**
 * Run aggregate query
 */
async function runAggregateQuery(collection: string, filters: any = {}, aggregations: any = {}) {
  const accessToken = await getAccessToken();

  // Parse the collection path to separate parent path from collection ID
  const pathSegments = collection.split("/");
  const collectionId = pathSegments[pathSegments.length - 1];
  const parentPath = pathSegments.slice(0, -1).join("/");

  // Build the URL with parent path if it exists
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const url = parentPath ? `${baseUrl}/${parentPath}:runAggregationQuery` : `${baseUrl}:runAggregationQuery`;

  const structuredQuery: any = {
    from: [{ collectionId: collectionId, allDescendants: filters.allDescendants || false }],
  };

  // Add where filters if provided
  if (filters.where) {
    structuredQuery.where = filters.where;
  }

  // Add orderBy if provided
  if (filters.orderBy) {
    structuredQuery.orderBy = filters.orderBy;
  }

  // Add limit if provided
  if (filters.limit) {
    structuredQuery.limit = filters.limit;
  }

  // Add offset if provided
  if (filters.offset) {
    structuredQuery.offset = filters.offset;
  }

  // Add startAt cursor if provided
  if (filters.startAt) {
    structuredQuery.startAt = filters.startAt;
  }

  // Add endAt cursor if provided
  if (filters.endAt) {
    structuredQuery.endAt = filters.endAt;
  }

  // Build aggregations
  const aggregationsArray: any[] = [];
  for (const [alias, aggregation] of Object.entries(aggregations)) {
    const agg: any = { alias };
    const aggField = aggregation as AggregateField;

    if (aggField.aggregateType === "count") {
      agg.count = {};
    } else if (aggField.aggregateType === "sum") {
      agg.sum = {
        field: { fieldPath: aggField.fieldPath },
      };
    } else if (aggField.aggregateType === "avg") {
      agg.avg = {
        field: { fieldPath: aggField.fieldPath },
      };
    }

    aggregationsArray.push(agg);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery,
        aggregations: aggregationsArray,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to run aggregation query: ${error}`);
  }

  const results = await response.json();
  return results;
}

// Firebase SDK-compatible types and classes

export interface DocumentData {
  [key: string]: any;
}

export interface DocumentSnapshot {
  id: string;
  exists: boolean;
  ref: DocumentReference;
  data(): DocumentData | undefined;
  get(fieldPath: string): any;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  readTime?: Timestamp;
}

export interface QueryDocumentSnapshot extends DocumentSnapshot {
  data(): DocumentData;
  createTime: Timestamp;
  updateTime: Timestamp;
  readTime: Timestamp;
}

export interface QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  query: Query;
  size: number;
  empty: boolean;
  readTime?: Timestamp;
  forEach(callback: (doc: QueryDocumentSnapshot) => void): void;
}

export interface WriteResult {
  writeTime: Timestamp;
}

export interface SetOptions {
  merge?: boolean;
  mergeFields?: string[];
}

export interface ReadOptions {
  fieldMask?: string[];
}

export interface TransactionOptions {
  readOnly?: boolean;
  readWrite?: {
    retryTransaction?: string;
  };
  maxAttempts?: number;
}

export interface AggregateSpec {
  [field: string]: AggregateField;
}

export interface AggregateQuerySnapshot {
  query: AggregateQuery;
  readTime: Timestamp;
  data(): {
    [field: string]: number;
  };
}

/**
 * WriteBatch for atomic batch operations
 */
export class WriteBatch {
  private writes: any[] = [];
  private committed = false;

  constructor(_firestore: Firestore) {}

  set(documentRef: DocumentReference, data: DocumentData, options?: SetOptions): WriteBatch {
    if (this.committed) {
      throw new Error("Cannot modify a WriteBatch that has been committed");
    }

    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== DELETE_FIELD_SENTINEL) {
        fields[key] = toFirestoreValue(value);
      }
    }

    if (options?.merge || options?.mergeFields) {
      const updateMask = options.mergeFields || Object.keys(data);
      this.writes.push({
        update: {
          name: docPath,
          fields,
        },
        updateMask: {
          fieldPaths: updateMask,
        },
      });
    } else {
      this.writes.push({
        update: {
          name: docPath,
          fields,
        },
      });
    }

    return this;
  }

  update(documentRef: DocumentReference, data: DocumentData): WriteBatch {
    if (this.committed) {
      throw new Error("Cannot modify a WriteBatch that has been committed");
    }

    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};
    const transforms: any[] = [];
    const updateMask: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === DELETE_FIELD_SENTINEL) {
        updateMask.push(key);
        continue;
      }

      if (value === SERVER_TIMESTAMP_SENTINEL) {
        transforms.push({
          fieldPath: key,
          setToServerValue: "REQUEST_TIME",
        });
        continue;
      }

      if (value instanceof IncrementValue) {
        transforms.push({
          fieldPath: key,
          increment: toFirestoreValue(value.operand),
        });
        continue;
      }

      if (value instanceof ArrayUnionValue) {
        transforms.push({
          fieldPath: key,
          appendMissingElements: {
            values: value.elements.map((item) => toFirestoreValue(item)),
          },
        });
        continue;
      }

      if (value instanceof ArrayRemoveValue) {
        transforms.push({
          fieldPath: key,
          removeAllFromArray: {
            values: value.elements.map((item) => toFirestoreValue(item)),
          },
        });
        continue;
      }

      fields[key] = toFirestoreValue(value);
      updateMask.push(key);
    }

    const write: any = {
      update: {
        name: docPath,
        fields,
      },
      updateMask: {
        fieldPaths: updateMask,
      },
      currentDocument: {
        exists: true,
      },
    };

    if (transforms.length > 0) {
      write.updateTransforms = transforms;
    }

    this.writes.push(write);
    return this;
  }

  delete(documentRef: DocumentReference): WriteBatch {
    if (this.committed) {
      throw new Error("Cannot modify a WriteBatch that has been committed");
    }

    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    this.writes.push({
      delete: docPath,
    });

    return this;
  }

  create(documentRef: DocumentReference, data: DocumentData): WriteBatch {
    if (this.committed) {
      throw new Error("Cannot modify a WriteBatch that has been committed");
    }

    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};

    for (const [key, value] of Object.entries(data)) {
      fields[key] = toFirestoreValue(value);
    }

    this.writes.push({
      update: {
        name: docPath,
        fields,
      },
      currentDocument: {
        exists: false,
      },
    });

    return this;
  }

  async commit(): Promise<WriteResult[]> {
    if (this.committed) {
      throw new Error("Cannot commit a WriteBatch that has already been committed");
    }

    this.committed = true;

    if (this.writes.length === 0) {
      return [];
    }

    const result = (await commitBatch(this.writes)) as { writeResults?: any[] };
    const now = Timestamp.now();

    return result.writeResults?.map(() => ({ writeTime: now })) || [];
  }
}

/**
 * Transaction for ACID operations
 */
export class Transaction {
  private writes: any[] = [];
  private transactionId: string;

  constructor(transactionId: string, _firestore: Firestore) {
    this.transactionId = transactionId;
  }

  async get(documentRef: DocumentReference): Promise<DocumentSnapshot> {
    const accessToken = await getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:batchGet`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [`projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`],
        transaction: this.transactionId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get document in transaction: ${error}`);
    }

    const results = (await response.json()) as any[];
    const result = results[0];

    if (result.missing) {
      return {
        id: documentRef.id,
        exists: false,
        ref: documentRef,
        data: () => undefined,
        get: () => undefined,
      };
    }

    const doc = result.found;
    const data: any = { id: doc.name.split("/").pop() };

    for (const [key, value] of Object.entries(doc.fields || {})) {
      data[key] = fromFirestoreValue(value);
    }

    return {
      id: documentRef.id,
      exists: true,
      ref: documentRef,
      data: () => data,
      get: (fieldPath: string) => data[fieldPath],
      createTime: doc.createTime ? Timestamp.fromDate(new Date(doc.createTime)) : undefined,
      updateTime: doc.updateTime ? Timestamp.fromDate(new Date(doc.updateTime)) : undefined,
    };
  }

  set(documentRef: DocumentReference, data: DocumentData, options?: SetOptions): Transaction {
    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== DELETE_FIELD_SENTINEL) {
        fields[key] = toFirestoreValue(value);
      }
    }

    if (options?.merge || options?.mergeFields) {
      const updateMask = options.mergeFields || Object.keys(data);
      this.writes.push({
        update: {
          name: docPath,
          fields,
        },
        updateMask: {
          fieldPaths: updateMask,
        },
      });
    } else {
      this.writes.push({
        update: {
          name: docPath,
          fields,
        },
      });
    }

    return this;
  }

  update(documentRef: DocumentReference, data: DocumentData): Transaction {
    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};
    const transforms: any[] = [];
    const updateMask: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === DELETE_FIELD_SENTINEL) {
        updateMask.push(key);
        continue;
      }

      if (value === SERVER_TIMESTAMP_SENTINEL) {
        transforms.push({
          fieldPath: key,
          setToServerValue: "REQUEST_TIME",
        });
        continue;
      }

      if (value instanceof IncrementValue) {
        transforms.push({
          fieldPath: key,
          increment: toFirestoreValue(value.operand),
        });
        continue;
      }

      if (value instanceof ArrayUnionValue) {
        transforms.push({
          fieldPath: key,
          appendMissingElements: {
            values: value.elements.map((item) => toFirestoreValue(item)),
          },
        });
        continue;
      }

      if (value instanceof ArrayRemoveValue) {
        transforms.push({
          fieldPath: key,
          removeAllFromArray: {
            values: value.elements.map((item) => toFirestoreValue(item)),
          },
        });
        continue;
      }

      fields[key] = toFirestoreValue(value);
      updateMask.push(key);
    }

    const write: any = {
      update: {
        name: docPath,
        fields,
      },
      updateMask: {
        fieldPaths: updateMask,
      },
      currentDocument: {
        exists: true,
      },
    };

    if (transforms.length > 0) {
      write.updateTransforms = transforms;
    }

    this.writes.push(write);
    return this;
  }

  delete(documentRef: DocumentReference): Transaction {
    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    this.writes.push({
      delete: docPath,
    });

    return this;
  }

  create(documentRef: DocumentReference, data: DocumentData): Transaction {
    const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentRef.path}`;
    const fields: any = {};

    for (const [key, value] of Object.entries(data)) {
      fields[key] = toFirestoreValue(value);
    }

    this.writes.push({
      update: {
        name: docPath,
        fields,
      },
      currentDocument: {
        exists: false,
      },
    });

    return this;
  }

  async commit(): Promise<void> {
    if (this.writes.length === 0) {
      return;
    }

    await commitTransaction(this.transactionId, this.writes);
  }

  getWrites(): any[] {
    return this.writes;
  }
}

export class DocumentReference {
  private _firestore?: Firestore;

  constructor(private collectionPath: string, private docId?: string, firestore?: Firestore) {
    this._firestore = firestore;
  }

  get id(): string {
    return this.docId || "";
  }

  get path(): string {
    return this.docId ? `${this.collectionPath}/${this.docId}` : this.collectionPath;
  }

  get parent(): CollectionReference {
    return new CollectionReference(this.collectionPath, this._firestore);
  }

  get firestore(): Firestore {
    return this._firestore || new Firestore();
  }

  async get(): Promise<DocumentSnapshot> {
    if (!this.docId) {
      throw new Error("Document ID is required for get() operation");
    }

    const data = await getDocument(this.collectionPath, this.docId);

    return {
      id: this.docId,
      exists: data !== null,
      ref: this,
      data: () => data,
      get: (fieldPath: string) => data?.[fieldPath],
    };
  }

  async set(data: DocumentData, options?: SetOptions): Promise<WriteResult> {
    if (!this.docId) {
      throw new Error("Document ID is required for set() operation");
    }

    await setDocument(this.collectionPath, this.docId, data, options?.merge);
    return { writeTime: Timestamp.now() };
  }

  async update(data: DocumentData): Promise<WriteResult> {
    if (!this.docId) {
      throw new Error("Document ID is required for update() operation");
    }

    await updateDocument(this.collectionPath, this.docId, data);
    return { writeTime: Timestamp.now() };
  }

  async delete(): Promise<WriteResult> {
    if (!this.docId) {
      throw new Error("Document ID is required for delete() operation");
    }

    await deleteDocument(this.collectionPath, this.docId);
    return { writeTime: Timestamp.now() };
  }

  async create(data: DocumentData): Promise<WriteResult> {
    if (!this.docId) {
      throw new Error("Document ID is required for create() operation");
    }

    // Check if document exists first
    const exists = await getDocument(this.collectionPath, this.docId);
    if (exists) {
      throw new Error(`Document already exists: ${this.path}`);
    }

    await setDocument(this.collectionPath, this.docId, data, false);
    return { writeTime: Timestamp.now() };
  }

  collection(collectionId: string): CollectionReference {
    return new CollectionReference(`${this.collectionPath}/${this.docId}/${collectionId}`, this._firestore);
  }

  isEqual(other: DocumentReference): boolean {
    return this.path === other.path;
  }
}

export class Query {
  protected filters: any[] = [];
  protected orderByFields: any[] = [];
  protected queryLimit?: number;
  protected queryLimitType?: "FIRST" | "LAST";
  protected queryOffset?: number;
  protected startAtValues?: any[];
  protected startAtBefore?: boolean;
  protected endAtValues?: any[];
  protected endAtBefore?: boolean;
  protected selectFields?: string[];
  protected _firestore?: Firestore;

  constructor(protected collectionId: string, firestore?: Firestore) {
    this._firestore = firestore;
  }

  get firestore(): Firestore {
    return this._firestore || new Firestore();
  }

  where(field: string, opStr: string, value: any): Query {
    const query = this.clone();
    query.filters.push({ field, opStr, value });
    return query;
  }

  orderBy(field: string, directionStr: string = "ASCENDING"): Query {
    const query = this.clone();
    const direction = directionStr.toLowerCase() === "desc" || directionStr === "DESCENDING" ? "DESCENDING" : "ASCENDING";
    query.orderByFields.push({ field, direction });
    return query;
  }

  limit(limit: number): Query {
    const query = this.clone();
    query.queryLimit = limit;
    query.queryLimitType = "FIRST";
    return query;
  }

  limitToLast(limit: number): Query {
    const query = this.clone();
    query.queryLimit = limit;
    query.queryLimitType = "LAST";
    return query;
  }

  offset(offset: number): Query {
    const query = this.clone();
    query.queryOffset = offset;
    return query;
  }

  startAt(...fieldValues: any[]): Query {
    const query = this.clone();
    query.startAtValues = fieldValues;
    query.startAtBefore = false;
    return query;
  }

  startAfter(...fieldValues: any[]): Query {
    const query = this.clone();
    query.startAtValues = fieldValues;
    query.startAtBefore = true;
    return query;
  }

  endAt(...fieldValues: any[]): Query {
    const query = this.clone();
    query.endAtValues = fieldValues;
    query.endAtBefore = false;
    return query;
  }

  endBefore(...fieldValues: any[]): Query {
    const query = this.clone();
    query.endAtValues = fieldValues;
    query.endAtBefore = true;
    return query;
  }

  select(...fields: string[]): Query {
    const query = this.clone();
    query.selectFields = fields;
    return query;
  }

  async get(): Promise<QuerySnapshot> {
    // Build Firestore query structure
    const whereClause = this.buildWhereClause();
    const orderByClause = this.buildOrderByClause();
    const startAtClause = this.buildStartAtClause();
    const endAtClause = this.buildEndAtClause();

    const filters: any = {};
    if (whereClause) filters.where = whereClause;
    if (orderByClause) filters.orderBy = orderByClause;
    if (this.queryLimit) filters.limit = this.queryLimit;
    if (this.queryOffset) filters.offset = this.queryOffset;
    if (startAtClause) filters.startAt = startAtClause;
    if (endAtClause) filters.endAt = endAtClause;
    if (this.selectFields) filters.select = this.selectFields;

    const documents = await queryDocuments(this.collectionId, filters);

    // If limitToLast, reverse the results
    if (this.queryLimitType === "LAST") {
      documents.reverse();
    }

    const docs: QueryDocumentSnapshot[] = documents.map((doc: any) => {
      const ref = new DocumentReference(this.collectionId, doc.id, this._firestore);
      return {
        id: doc.id,
        exists: true,
        ref,
        data: () => doc,
        get: (fieldPath: string) => doc[fieldPath],
        createTime: Timestamp.now(),
        updateTime: Timestamp.now(),
        readTime: Timestamp.now(),
      };
    });

    return {
      docs,
      query: this,
      size: docs.length,
      empty: docs.length === 0,
      readTime: Timestamp.now(),
      forEach: (callback: (doc: QueryDocumentSnapshot) => void) => {
        docs.forEach(callback);
      },
    };
  }

  async count(): Promise<number> {
    const snapshot = await this.get();
    return snapshot.size;
  }

  aggregate(aggregateSpec: AggregateSpec): AggregateQuery {
    return new AggregateQuery(this, aggregateSpec);
  }

  protected clone(): Query {
    const query = new Query(this.collectionId, this._firestore);
    query.filters = [...this.filters];
    query.orderByFields = [...this.orderByFields];
    query.queryLimit = this.queryLimit;
    query.queryLimitType = this.queryLimitType;
    query.queryOffset = this.queryOffset;
    query.startAtValues = this.startAtValues;
    query.startAtBefore = this.startAtBefore;
    query.endAtValues = this.endAtValues;
    query.endAtBefore = this.endAtBefore;
    query.selectFields = this.selectFields;
    return query;
  }

  protected buildWhereClause() {
    if (this.filters.length === 0) return null;

    if (this.filters.length === 1) {
      const filter = this.filters[0];
      return {
        fieldFilter: {
          field: { fieldPath: filter.field },
          op: this.mapOperator(filter.opStr),
          value: toFirestoreValue(filter.value),
        },
      };
    }

    return {
      compositeFilter: {
        op: "AND",
        filters: this.filters.map((filter) => ({
          fieldFilter: {
            field: { fieldPath: filter.field },
            op: this.mapOperator(filter.opStr),
            value: toFirestoreValue(filter.value),
          },
        })),
      },
    };
  }

  protected buildOrderByClause() {
    if (this.orderByFields.length === 0) return null;

    return this.orderByFields.map((order) => ({
      field: { fieldPath: order.field },
      direction: order.direction,
    }));
  }

  protected buildStartAtClause() {
    if (!this.startAtValues) return null;

    return {
      values: this.startAtValues.map((v) => toFirestoreValue(v)),
      before: this.startAtBefore,
    };
  }

  protected buildEndAtClause() {
    if (!this.endAtValues) return null;

    return {
      values: this.endAtValues.map((v) => toFirestoreValue(v)),
      before: this.endAtBefore,
    };
  }

  protected mapOperator(opStr: string): string {
    const operatorMap: { [key: string]: string } = {
      "==": "EQUAL",
      "!=": "NOT_EQUAL",
      "<": "LESS_THAN",
      "<=": "LESS_THAN_OR_EQUAL",
      ">": "GREATER_THAN",
      ">=": "GREATER_THAN_OR_EQUAL",
      "array-contains": "ARRAY_CONTAINS",
      in: "IN",
      "not-in": "NOT_IN",
      "array-contains-any": "ARRAY_CONTAINS_ANY",
    };
    return operatorMap[opStr] || "EQUAL";
  }

  isEqual(other: Query): boolean {
    return (
      JSON.stringify(this.buildWhereClause()) === JSON.stringify(other.buildWhereClause()) &&
      JSON.stringify(this.buildOrderByClause()) === JSON.stringify(other.buildOrderByClause()) &&
      this.queryLimit === other.queryLimit
    );
  }
}

export class CollectionReference extends Query {
  protected _firestore?: Firestore;

  constructor(private collectionPath: string, firestore?: Firestore) {
    super(collectionPath, firestore);
    this._firestore = firestore;
  }

  get id(): string {
    const segments = this.collectionPath.split("/");
    return segments[segments.length - 1];
  }

  get path(): string {
    return this.collectionPath;
  }

  get parent(): DocumentReference | null {
    const segments = this.collectionPath.split("/");
    if (segments.length < 2) {
      return null;
    }
    const docId = segments[segments.length - 2];
    const parentPath = segments.slice(0, -2).join("/");
    return new DocumentReference(parentPath, docId, this._firestore);
  }

  get firestore(): Firestore {
    return this._firestore || new Firestore();
  }

  doc(docId?: string): DocumentReference {
    if (!docId) {
      // Generate random ID
      docId = this.generateRandomId();
    }
    return new DocumentReference(this.collectionPath, docId, this._firestore);
  }

  async add(data: DocumentData): Promise<DocumentReference> {
    const result = (await createDocument(this.collectionPath, data)) as { name: string };
    const docId = result.name.split("/").pop();
    return new DocumentReference(this.collectionPath, docId, this._firestore);
  }

  async listDocuments(): Promise<DocumentReference[]> {
    const result = await listDocuments(this.collectionPath, 1000);
    return result.documents.map((doc: any) => new DocumentReference(this.collectionPath, doc.id, this._firestore));
  }

  private generateRandomId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let autoId = "";
    for (let i = 0; i < 20; i++) {
      autoId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return autoId;
  }
}

/**
 * CollectionGroup for querying across all collections with the same ID
 */
export class CollectionGroup extends Query {
  constructor(collectionId: string, firestore?: Firestore) {
    super(collectionId, firestore);
  }

  protected clone(): CollectionGroup {
    const query = new CollectionGroup(this.collectionId, this._firestore);
    query.filters = [...this.filters];
    query.orderByFields = [...this.orderByFields];
    query.queryLimit = this.queryLimit;
    query.queryLimitType = this.queryLimitType;
    query.queryOffset = this.queryOffset;
    query.startAtValues = this.startAtValues;
    query.startAtBefore = this.startAtBefore;
    query.endAtValues = this.endAtValues;
    query.endAtBefore = this.endAtBefore;
    query.selectFields = this.selectFields;
    return query;
  }

  async get(): Promise<QuerySnapshot> {
    // Build Firestore query structure for collection group
    const whereClause = this.buildWhereClause();
    const orderByClause = this.buildOrderByClause();
    const startAtClause = this.buildStartAtClause();
    const endAtClause = this.buildEndAtClause();

    const filters: any = { allDescendants: true };
    if (whereClause) filters.where = whereClause;
    if (orderByClause) filters.orderBy = orderByClause;
    if (this.queryLimit) filters.limit = this.queryLimit;
    if (this.queryOffset) filters.offset = this.queryOffset;
    if (startAtClause) filters.startAt = startAtClause;
    if (endAtClause) filters.endAt = endAtClause;
    if (this.selectFields) filters.select = this.selectFields;

    const documents = await queryCollectionGroup(this.collectionId, filters);

    // If limitToLast, reverse the results
    if (this.queryLimitType === "LAST") {
      documents.reverse();
    }

    const docs: QueryDocumentSnapshot[] = documents.map((doc: any) => {
      const ref = new DocumentReference(this.collectionId, doc.id, this._firestore);
      return {
        id: doc.id,
        exists: true,
        ref,
        data: () => doc,
        get: (fieldPath: string) => doc[fieldPath],
        createTime: Timestamp.now(),
        updateTime: Timestamp.now(),
        readTime: Timestamp.now(),
      };
    });

    return {
      docs,
      query: this,
      size: docs.length,
      empty: docs.length === 0,
      readTime: Timestamp.now(),
      forEach: (callback: (doc: QueryDocumentSnapshot) => void) => {
        docs.forEach(callback);
      },
    };
  }
}

/**
 * AggregateQuery for aggregate operations (count, sum, avg)
 */
export class AggregateQuery {
  constructor(private query: Query, private aggregateSpec: AggregateSpec) {}

  async get(): Promise<AggregateQuerySnapshot> {
    // Build the base query filters from the Query instance
    const filters: any = {};

    // Access protected properties through the query instance
    const whereClause = (this.query as any).buildWhereClause();
    const orderByClause = (this.query as any).buildOrderByClause();
    const startAtClause = (this.query as any).buildStartAtClause();
    const endAtClause = (this.query as any).buildEndAtClause();

    if (whereClause) filters.where = whereClause;
    if (orderByClause) filters.orderBy = orderByClause;
    if ((this.query as any).queryLimit) filters.limit = (this.query as any).queryLimit;
    if ((this.query as any).queryOffset) filters.offset = (this.query as any).queryOffset;
    if (startAtClause) filters.startAt = startAtClause;
    if (endAtClause) filters.endAt = endAtClause;

    // Check if it's a collection group query
    if (this.query instanceof CollectionGroup) {
      filters.allDescendants = true;
    }

    // Run the aggregation query
    const collectionId = (this.query as any).collectionId;
    const results = (await runAggregateQuery(collectionId, filters, this.aggregateSpec)) as any[];

    // Parse the results
    const aggregateFields: { [field: string]: number } = {};

    if (results && results[0] && results[0].result) {
      const resultData = results[0].result.aggregateFields;

      for (const [alias, value] of Object.entries(resultData)) {
        const fieldValue = value as any;
        if (fieldValue.integerValue !== undefined) {
          aggregateFields[alias] = parseInt(fieldValue.integerValue, 10);
        } else if (fieldValue.doubleValue !== undefined) {
          aggregateFields[alias] = fieldValue.doubleValue;
        } else {
          aggregateFields[alias] = 0;
        }
      }
    }

    const readTime = results && results[0] && results[0].readTime ? Timestamp.fromDate(new Date(results[0].readTime)) : Timestamp.now();

    return {
      query: this,
      readTime,
      data: () => aggregateFields,
    };
  }
}

export class Firestore {
  collection(collectionId: string): CollectionReference {
    return new CollectionReference(collectionId, this);
  }

  doc(documentPath: string): DocumentReference {
    const segments = documentPath.split("/");
    if (segments.length % 2 !== 0) {
      throw new Error("Invalid document path. Document paths must have an even number of segments.");
    }

    const collectionPath = segments.slice(0, -1).join("/");
    const docId = segments[segments.length - 1];
    return new DocumentReference(collectionPath, docId, this);
  }

  collectionGroup(collectionId: string): CollectionGroup {
    return new CollectionGroup(collectionId, this);
  }

  batch(): WriteBatch {
    return new WriteBatch(this);
  }

  async getAll(...documentRefs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    if (documentRefs.length === 0) {
      return [];
    }

    const paths = documentRefs.map((ref) => ref.path);
    const results = (await batchGetDocuments(paths)) as any[];

    return results.map((result: any, index: number) => {
      const ref = documentRefs[index];

      if (result.missing) {
        return {
          id: ref.id,
          exists: false,
          ref,
          data: () => undefined,
          get: () => undefined,
        };
      }

      const doc = result.found;
      const data: any = { id: doc.name.split("/").pop() };

      for (const [key, value] of Object.entries(doc.fields || {})) {
        data[key] = fromFirestoreValue(value);
      }

      return {
        id: ref.id,
        exists: true,
        ref,
        data: () => data,
        get: (fieldPath: string) => data[fieldPath],
        createTime: doc.createTime ? Timestamp.fromDate(new Date(doc.createTime)) : undefined,
        updateTime: doc.updateTime ? Timestamp.fromDate(new Date(doc.updateTime)) : undefined,
        readTime: doc.readTime ? Timestamp.fromDate(new Date(doc.readTime)) : undefined,
      };
    });
  }

  async runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T> {
    const maxAttempts = options?.maxAttempts || 5;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const transactionOptions: any = {};

        if (options?.readOnly) {
          transactionOptions.readOnly = true;
        } else if (options?.readWrite?.retryTransaction) {
          transactionOptions.readWrite = {
            retryTransaction: options.readWrite.retryTransaction,
          };
        }

        const transactionId = await beginTransaction(transactionOptions);
        const transaction = new Transaction(transactionId, this);

        try {
          const result = await updateFunction(transaction);
          await transaction.commit();
          return result;
        } catch (error) {
          await rollbackTransaction(transactionId).catch(() => {
            // Ignore rollback errors
          });
          throw error;
        }
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        if (error.message?.includes("ABORTED") || error.message?.includes("contention")) {
          // Wait before retrying with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }

        // Non-retryable error, throw immediately
        throw error;
      }
    }

    throw lastError || new Error("Transaction failed after maximum attempts");
  }
}

// Main export - Firebase SDK-compatible Firestore instance
export const db = new Firestore();

// Also export getFirestore function for Firebase SDK compatibility
export function getFirestore(): Firestore {
  return db;
}
