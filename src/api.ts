export async function apiGet<T>(path: string) {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed [${response.status}]: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, data: any) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed [${response.status}]: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, data: any) {
  const response = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed [${response.status}]: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string) {
  const response = await fetch(path, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed [${response.status}]: ${body}`);
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────
// Tenant Data Queries
// ─────────────────────────────────────────────────────────────────────────


export function getTenantProducts(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/products`);
}

export function getTenantConfig(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/config`);
}

export function getTenantCustomers(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/customers`);
}

export function getTenantStaff(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/staff`);
}

export function getTenantWorkstations(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/workstations`);
}

export function getTenantSales(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/sales`);
}

export function getOpenCashSession(tenantId: string, staffId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/cash-sessions?staffId=${encodeURIComponent(staffId)}`);
}

export function getTenantIdBySlug(slug: string) {
  return apiGet<{ tenantId: string }>(`/api/mariadb/slugs/${encodeURIComponent(slug)}/tenant`);
}

export function getUserByUid(uid: string) {
  return apiGet<any>(`/api/mariadb/users/${encodeURIComponent(uid)}`);
}

export function getStaffTenantByEmail(email: string) {
  return apiGet<any>(`/api/mariadb/staff?email=${encodeURIComponent(email)}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD: Products
// ─────────────────────────────────────────────────────────────────────────

export function createProduct(tenantId: string, product: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/products`, product);
}

export function updateProduct(tenantId: string, productId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/products/${productId}`, updates);
}

export function deleteProduct(tenantId: string, productId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/products/${productId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD: Customers
// ─────────────────────────────────────────────────────────────────────────

export function createCustomer(tenantId: string, customer: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/customers`, customer);
}

export function updateCustomer(tenantId: string, customerId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}`, updates);
}

export function deleteCustomer(tenantId: string, customerId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD: Staff
// ─────────────────────────────────────────────────────────────────────────

export function createStaff(tenantId: string, staff: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/staff`, staff);
}

export function updateStaff(tenantId: string, staffId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/staff/${staffId}`, updates);
}

export function deleteStaff(tenantId: string, staffId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/staff/${staffId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD: Workstations
// ─────────────────────────────────────────────────────────────────────────

export function createWorkstation(tenantId: string, workstation: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/workstations`, workstation);
}

export function deleteWorkstation(tenantId: string, workstationId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/workstations/${workstationId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD: Sales
// ─────────────────────────────────────────────────────────────────────────

export function createSale(tenantId: string, sale: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/sales`, sale);
}

export function getSaleById(tenantId: string, saleId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`);
}

export function updateSaleStatus(tenantId: string, saleId: string, status: string) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`, { status });
}
