const fs = require('fs');
let posTsx = fs.readFileSync('src/components/PointOfSaleView.tsx', 'utf8');
posTsx = posTsx.replace("import React, { useMemo } from 'react';", "import React, { useMemo, useState } from 'react';");
fs.writeFileSync('src/components/PointOfSaleView.tsx', posTsx);
