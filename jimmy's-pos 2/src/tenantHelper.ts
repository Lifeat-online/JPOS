import { collection, doc } from "firebase/firestore";

export function getTenantCollection(db: any, tenantId: string | null, collectionName: string) {
  if (!tenantId) throw new Error(`Cannot get collection ${collectionName} without tenantId`);
  return collection(db, `tenants/${tenantId}/${collectionName}`);
}

export function getTenantDoc(db: any, tenantId: string | null, collectionName: string, docId: string) {
  if (!tenantId) throw new Error(`Cannot get doc ${collectionName}/${docId} without tenantId`);
  return doc(db, `tenants/${tenantId}/${collectionName}`, docId);
}
