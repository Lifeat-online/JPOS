export const productTemplateCsv = `name,price,cost_price,category,section,sub_category,stock,min_stock,barcode
Chocolate Muffin,32,14,Bakery,Food,Muffins,24,6,BAK-001
Flat White,28,9,Drinks,Beverages,Coffee,100,20,DRK-001
`;

export const priceTemplateCsv = `barcode,price,costPrice
BAK-001,35,15
DRK-001,30,10
`;

export const inventoryTemplateCsv = `barcode,locationId,quantity,minStock,reorderThreshold
BAK-001,main,36,8,10
DRK-001,main,80,20,25
`;

export const customerTemplateCsv = `name,email,phone,loyaltyPoints,accountEnabled,accountLimit,discountPercent
Sarah Demo,sarah@example.com,0820000000,120,yes,500,5
Thabo Sample,thabo@example.com,0830000000,0,no,0,0
`;

export const vendorTemplateCsv = `name,contact_person,email,phone,address,status
Fresh Farms,Anna Smith,orders@freshfarms.example,0215550101,12 Market Road,active
Bulk Beverages,Pieter Naidoo,sales@bulkbev.example,0115550102,4 Depot Street,active
`;

export const staffTemplateCsv = `name,email,role,phone,pay_rate,pay_type,status
Lerato Mokoena,lerato@example.com,cashier,0825550101,35,hourly,active
Sipho Dlamini,sipho@example.com,chef,0825550102,42,hourly,active
`;
