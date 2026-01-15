# firestore-edge

A lightweight Firestore client using the REST API with service account authentication. Designed for **edge runtimes**, **workflow environments**, and anywhere you need Firestore without the full Firebase SDK.

## Features

- 🚀 **Edge-ready** – Works in Cloudflare Workers, Vercel Edge, and other edge runtimes
- 🔧 **Workflow compatible** – Uses `jose` library for WebCrypto-compatible JWT signing
- 📦 **Lightweight** – Minimal dependencies
- 🔑 **Service account auth** – Secure JWT-based authentication
- 💾 **Token caching** – Automatic OAuth token caching with smart refresh
- 📝 **Full CRUD** – Get, create, update, set, delete, list, and query documents
- 🎯 **TypeScript** – Full type definitions included
- 🔄 **Firebase Admin SDK compatible** – Same API as Firebase Admin SDK

## Installation

```bash
npm install @jerrick/firestore-edge
```

```bash
pnpm add @jerrick/firestore-edge
```

```bash
yarn add @jerrick/firestore-edge
```

## Setup

### Environment Variables

Set these environment variables for service account authentication:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...
FIREBASE_UNIVERSE_DOMAIN=googleapis.com
```

**Note:** The `FIREBASE_PRIVATE_KEY` can have escaped newlines (`\n`) or literal newlines. The library handles both formats.

## Quick Start

```typescript
import { db } from "@jerrick/firestore-edge";

// Get a document
const docRef = db.collection("users").doc("user-123");
const snapshot = await docRef.get();

if (snapshot.exists) {
  const userData = snapshot.data();
  console.log(userData);
}
```

## CRUD Operations

### Create

#### Create a document with auto-generated ID

```typescript
import { db } from "@jerrick/firestore-edge";

const collectionRef = db.collection("users");
const newDocRef = await collectionRef.add({
  name: "John Doe",
  email: "john@example.com",
  createdAt: new Date(),
});

console.log("Created document with ID:", newDocRef.id);
```

#### Create a document with specific ID

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.create({
  name: "John Doe",
  email: "john@example.com",
  createdAt: new Date(),
});
```

#### Set a document (create or overwrite)

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");

// Overwrite entire document
await docRef.set({
  name: "John Doe",
  email: "john@example.com",
});

// Merge with existing data
await docRef.set(
  {
    lastLogin: new Date(),
  },
  { merge: true }
);
```

### Read

#### Get a single document

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
const snapshot = await docRef.get();

if (snapshot.exists) {
  const data = snapshot.data();
  console.log("User:", data);
  console.log("User ID:", snapshot.id);
  console.log("Name:", snapshot.get("name"));
} else {
  console.log("Document does not exist");
}
```

#### Get multiple documents

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef1 = db.collection("users").doc("user-123");
const docRef2 = db.collection("users").doc("user-456");
const docRef3 = db.collection("users").doc("user-789");

const snapshots = await db.getAll(docRef1, docRef2, docRef3);

snapshots.forEach((snapshot) => {
  if (snapshot.exists) {
    console.log(snapshot.id, snapshot.data());
  }
});
```

#### List documents in a collection

```typescript
import { db } from "@jerrick/firestore-edge";

const collectionRef = db.collection("users");
const documentRefs = await collectionRef.listDocuments();

for (const docRef of documentRefs) {
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    console.log(docRef.id, snapshot.data());
  }
}
```

### Update

#### Update specific fields

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.update({
  name: "Jane Doe",
  updatedAt: new Date(),
});
```

### Delete

#### Delete a document

```typescript
import { db } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.delete();
```

## Querying

### Basic Queries

#### Simple where clause

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").where("status", "==", "active");

const snapshot = await query.get();
snapshot.forEach((doc) => {
  console.log(doc.id, doc.data());
});
```

#### Multiple conditions

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").where("age", ">", 18).where("age", "<", 65).where("status", "==", "active");

const snapshot = await query.get();
```

#### Order by

```typescript
import { db } from "@jerrick/firestore-edge";

// Ascending (default)
const query1 = db.collection("users").orderBy("createdAt");

// Descending
const query2 = db.collection("users").orderBy("createdAt", "desc");

const snapshot = await query2.get();
```

#### Limit results

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").where("status", "==", "active").orderBy("createdAt", "desc").limit(10);

const snapshot = await query.get();
```

#### Limit to last N results

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").orderBy("createdAt").limitToLast(5);

const snapshot = await query.get();
```

#### Offset and pagination

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").orderBy("createdAt").limit(10).offset(20); // Skip first 20 results

const snapshot = await query.get();
```

#### Cursor-based pagination

```typescript
import { db } from "@jerrick/firestore-edge";

// Start at a specific value
const query1 = db.collection("users").orderBy("age").startAt(25);

// Start after a specific value
const query2 = db.collection("users").orderBy("age").startAfter(25);

// End at a specific value
const query3 = db.collection("users").orderBy("age").endAt(65);

// End before a specific value
const query4 = db.collection("users").orderBy("age").endBefore(65);

const snapshot = await query4.get();
```

#### Select specific fields

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").select("name", "email");

const snapshot = await query.get();
snapshot.forEach((doc) => {
  // Only 'name' and 'email' fields are returned
  console.log(doc.data());
});
```

#### Count documents

```typescript
import { db } from "@jerrick/firestore-edge";

const query = db.collection("users").where("status", "==", "active");

const count = await query.count();
console.log(`Active users: ${count}`);
```

### Query Operators

Supported comparison operators:

- `==` - Equal to
- `!=` - Not equal to
- `<` - Less than
- `<=` - Less than or equal
- `>` - Greater than
- `>=` - Greater than or equal
- `array-contains` - Array contains value
- `array-contains-any` - Array contains any of the values
- `in` - Field value is in the array
- `not-in` - Field value is not in the array

#### Array queries

```typescript
import { db } from "@jerrick/firestore-edge";

// Array contains
const query1 = db.collection("posts").where("tags", "array-contains", "javascript");

// Array contains any
const query2 = db.collection("posts").where("tags", "array-contains-any", ["javascript", "typescript"]);

// In operator
const query3 = db.collection("users").where("role", "in", ["admin", "moderator"]);

// Not in operator
const query4 = db.collection("users").where("role", "not-in", ["banned", "suspended"]);
```

## Advanced Methods

### Field Values

#### Server Timestamp

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const docRef = db.collection("events").doc("event-123");
await docRef.set({
  name: "User Signup",
  timestamp: FieldValue.serverTimestamp(),
});
```

#### Delete Field

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.update({
  oldField: FieldValue.delete(),
});
```

#### Increment

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.update({
  viewCount: FieldValue.increment(1),
});
```

#### Array Union

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.update({
  tags: FieldValue.arrayUnion("javascript", "typescript"),
});
```

#### Array Remove

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const docRef = db.collection("users").doc("user-123");
await docRef.update({
  tags: FieldValue.arrayRemove("javascript"),
});
```

### Batch Operations

Batch writes allow you to perform multiple write operations atomically.

```typescript
import { db } from "@jerrick/firestore-edge";

const batch = db.batch();

const user1Ref = db.collection("users").doc("user-1");
const user2Ref = db.collection("users").doc("user-2");
const user3Ref = db.collection("users").doc("user-3");

// Add operations to batch
batch.set(user1Ref, { name: "Alice", age: 30 });
batch.update(user2Ref, { age: 31 });
batch.delete(user3Ref);

// Commit the batch
await batch.commit();
```

#### Batch with Field Values

```typescript
import { db, FieldValue } from "@jerrick/firestore-edge";

const batch = db.batch();

const docRef = db.collection("users").doc("user-123");
batch.update(docRef, {
  updatedAt: FieldValue.serverTimestamp(),
  viewCount: FieldValue.increment(1),
  tags: FieldValue.arrayUnion("new-tag"),
});

await batch.commit();
```

### Transactions

Transactions provide ACID guarantees for read-modify-write operations.

```typescript
import { db } from "@jerrick/firestore-edge";

const userRef = db.collection("users").doc("user-123");

await db.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(userRef);

  if (!snapshot.exists) {
    throw new Error("User does not exist");
  }

  const currentBalance = snapshot.data()?.balance || 0;
  const newBalance = currentBalance + 100;

  transaction.update(userRef, {
    balance: newBalance,
    lastTransaction: new Date(),
  });
});
```

#### Transaction with retry

Transactions automatically retry on conflicts. You can customize retry behavior:

```typescript
import { db } from "@jerrick/firestore-edge";

await db.runTransaction(
  async (transaction) => {
    // Your transaction logic
  },
  {
    maxAttempts: 10, // Default is 5
  }
);
```

### Collection Groups

Query across all collections with the same ID, regardless of their parent path.

```typescript
import { db } from "@jerrick/firestore-edge";

// Query all 'comments' collections across all documents
const query = db.collectionGroup("comments").where("approved", "==", true).orderBy("createdAt", "desc").limit(10);

const snapshot = await query.get();
snapshot.forEach((doc) => {
  console.log("Comment path:", doc.ref.path);
  console.log("Comment data:", doc.data());
});
```

### Subcollections

Access nested collections using document references.

```typescript
import { db } from "@jerrick/firestore-edge";

// Get a subcollection
const userRef = db.collection("users").doc("user-123");
const postsRef = userRef.collection("posts");

// Create a document in subcollection
const newPostRef = await postsRef.add({
  title: "My Post",
  content: "...",
  createdAt: new Date(),
});

// Query subcollection
const query = postsRef.where("published", "==", true).orderBy("createdAt", "desc");

const snapshot = await query.get();
```

### Timestamps

Work with Firestore timestamps.

```typescript
import { db, Timestamp } from "@jerrick/firestore-edge";

// Create timestamp from current time
const now = Timestamp.now();

// Create timestamp from Date
const date = new Date();
const timestamp = Timestamp.fromDate(date);

// Create timestamp from milliseconds
const timestamp2 = Timestamp.fromMillis(Date.now());

// Convert back to Date
const date2 = timestamp.toDate();

// Convert to milliseconds
const ms = timestamp.toMillis();

// Use in document
const docRef = db.collection("events").doc("event-123");
await docRef.set({
  name: "Event",
  createdAt: Timestamp.now(),
});
```

### GeoPoints

Store and query geographic coordinates.

```typescript
import { db, GeoPoint } from "@jerrick/firestore-edge";

const docRef = db.collection("locations").doc("location-123");
await docRef.set({
  name: "San Francisco",
  coordinates: new GeoPoint(37.7749, -122.4194),
});

// Compare GeoPoints
const point1 = new GeoPoint(37.7749, -122.4194);
const point2 = new GeoPoint(37.7749, -122.4194);
console.log(point1.isEqual(point2)); // true
```

### Field Paths

Reference nested fields or document IDs in queries.

```typescript
import { db, FieldPath } from "@jerrick/firestore-edge";

// Query by document ID
const query = db.collection("users").where(FieldPath.documentId(), "==", "user-123");

// Reference nested fields
const nestedPath = new FieldPath("user", "profile", "name");
```

## Type Safety

Use TypeScript generics for type-safe document operations:

```typescript
import { db } from "@jerrick/firestore-edge";

interface User {
  name: string;
  email: string;
  age: number;
  createdAt: Date;
}

// Typed document reference
const userRef = db.collection("users").doc("user-123");
const snapshot = await userRef.get();

if (snapshot.exists) {
  const user = snapshot.data() as User;
  console.log(user.name); // TypeScript knows this is a string
}
```

## Error Handling

The library throws descriptive errors:

```typescript
import { db } from "@jerrick/firestore-edge";

try {
  const docRef = db.collection("users").doc("user-123");
  await docRef.get();
} catch (error: any) {
  console.error("Error:", error.message);
}
```

## Supported Value Types

| JavaScript Type                | Firestore Type               |
| ------------------------------ | ---------------------------- |
| `string`                       | stringValue                  |
| `number` (integer)             | integerValue                 |
| `number` (float)               | doubleValue                  |
| `boolean`                      | booleanValue                 |
| `null` / `undefined`           | nullValue                    |
| `Date`                         | timestampValue               |
| `Timestamp`                    | timestampValue               |
| `GeoPoint`                     | geoPointValue                |
| `Array`                        | arrayValue                   |
| `Object`                       | mapValue                     |
| `FieldValue.serverTimestamp()` | timestampValue (server time) |

## Why firestore-edge?

The official Firebase Admin SDK uses `google-auth-library` which relies on WebCrypto APIs that aren't available in all edge runtimes and workflow environments. This library:

1. Uses `jose` library for WebCrypto-compatible JWT signing
2. Has minimal dependencies
3. Implements the essential Firestore operations
4. Provides Firebase Admin SDK-compatible API
5. Is tree-shakeable for minimal bundle size

## Requirements

- Node.js 18+ (for native `fetch`)
- A Firebase service account with Firestore access

## License

MIT
