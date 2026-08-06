const { sql, poolPromise } = require("../config/db");
const crypto = require("crypto");

function formatToSingaporeTime(date, options = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: options.hour || "2-digit",
    minute: options.minute || "2-digit",
    hour12: options.hour12 || false,
  }).format(date);
}

function formatToSingaporeDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatThermalTextWithDiscount(saleData, company, discountInfo) {
  const symbol = company.currencySymbol || "$";
  const name = company.name || "POS SYSTEM";
  const address = company.address || "";
  const gstNo = company.gstNo || "";
  const tel = company.phone || company.tel || "";

  const now = new Date();
  const dateStr = formatToSingaporeDate(now);
  const timeStr = formatToSingaporeTime(now);

  let text = `[C]<B>${name}</B>\n`;
  if (address) text += `[C]${address}\n`;
  if (gstNo) text += `[C]GST: ${gstNo}\n`;
  if (tel) text += `[C]Tel: ${tel}\n`;
  text += `[C]${dateStr} ${timeStr}\n`;
  text += "[L]================================\n";

  const tableNo = saleData.tableNo || "";
  const orderNo = saleData.orderNo || saleData.id || saleData.saleId || "";
  if (tableNo) text += `[L]Table: ${tableNo}\n`;
  if (orderNo) text += `[L]Order #: ${orderNo}\n`;
  text += "[L]================================\n";
  text += "[L]Item                   Qty  Total\n";
  text += "[L]--------------------------------\n";

  const items = saleData.items || saleData.cartItems || [];
  items.forEach((item) => {
    const itemName = (item.name || item.Name || item.DishName || item.ProductName || "Item").substring(0, 18);
    const qty = item.quantity || item.qty || 1;
    const price = (item.price || 0) * qty;
    const line = `${itemName.padEnd(20)} ${String(qty).padStart(3)}  ${symbol}${price.toFixed(2)}`;
    text += `[L]${line}\n`;

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((m) => {
        text += `[L]  + ${m.name || m.ModifierName}\n`;
      });
    }

    const comboSels = item.comboSelections || (item.ComboDetailsJSON ? (() => { try { return JSON.parse(item.ComboDetailsJSON); } catch { return []; } })() : []);
    if (comboSels && comboSels.length > 0) {
      comboSels.forEach((g) => {
        text += `[L]    ${g.groupName || g.GroupName}:\n`;
        const comboItems = g.items || g.Items || [];
        comboItems.forEach((opt) => {
          text += `[L]      ↳ ${opt.name || opt.Name}\n`;
        });
      });
    }
  });

  text += "[L]================================\n";

  const subtotal =
    saleData.subtotal ||
    items.reduce((s, i) => s + (i.price || 0) * (i.quantity || i.qty || 1), 0);
  text += `[R]Subtotal: ${symbol}${Number(subtotal).toFixed(2)}\n`;

  // Discount
  if (discountInfo && discountInfo.applied && discountInfo.amount > 0) {
    const discLabel =
      discountInfo.type === "percentage"
        ? `Discount (${discountInfo.value}%):`
        : "Discount:";
    text += `[R]${discLabel} -${symbol}${Number(discountInfo.amount).toFixed(2)}\n`;
  }

  const serviceCharge = saleData.serviceCharge || saleData.serviceChargeAmount || 0;
  if (serviceCharge > 0) {
    text += `[R]Service Charge: ${symbol}${Number(serviceCharge).toFixed(2)}\n`;
  }

  const gst = saleData.gst || saleData.gstAmount || 0;
  if (gst > 0) {
    text += `[R]GST: ${symbol}${Number(gst).toFixed(2)}\n`;
  }

  const total = saleData.total || saleData.totalAmount || saleData.grandTotal || 0;
  text += "[L]================================\n";
  text += `[R]<B>TOTAL: ${symbol}${Number(total).toFixed(2)}</B>\n`;
  text += "[L]================================\n";

  const payMode =
    saleData.paymentMode ||
    saleData.payMode ||
    saleData.PaymentMode ||
    "CASH";
  const paid = saleData.amountPaid || saleData.paidAmount || total;
  const change = saleData.change || saleData.changeAmount || Math.max(0, paid - total);

  text += `[L]Payment: ${payMode}\n`;
  text += `[L]Paid: ${symbol}${Number(paid).toFixed(2)}\n`;
  if (change > 0) text += `[L]Change: ${symbol}${Number(change).toFixed(2)}\n`;

  text += "[L]================================\n";
  text += "[C]Thank you for your visit!\n";
  text += `[C]© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD\n`;
  text += "\n\n";
  return text;
}

function formatKOTThermalText(data, itemsForPrinter, type) {
  const title =
    type === "KDS_PRINT"
      ? "KDS PRINT"
      : type === "REPRINT"
        ? "REPRINT"
        : type === "ADDITIONAL"
          ? "ADDITIONAL"
          : "NEW ORDER";
  const tableNo = data.tableNo || "N/A";
  const waiter = data.waiterName || "Staff";
  const orderNo = data.orderNo || data.orderId || "";
  const kitchenName = data.kitchenName || "";

  const now = new Date();
  const kotDateStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(now);
  const kotTimeStr = formatToSingaporeTime(now, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let text = `[C]<B>${title}</B>\n`;
  text += `[C]${kotDateStr} ${kotTimeStr}\n`;
  text += "[L]--------------------------------\n";
  text += `[C]<font size='big'>TABLE: ${tableNo}</font>\n`;
  text += "[L]--------------------------------\n";
  text += "[L]QTY  ITEM\n";
  text += "[L]--------------------------------\n";

  const renderThermalItem = (item) => {
    const qtyNum = item.quantity || item.qty || item.Quantity || 1;
    const itemName = item.name || item.Name || item.DishName || item.ProductName || "";
    const lines = itemName.split("\n");
    let t = "";
    lines.forEach((line, idx) => {
      if (idx === 0) {
        t += `[L]<font size='big'>[${qtyNum}] ${line}</font>\n`;
      } else {
        t += `[L]<font size='big'>    ${line}</font>\n`;
      }
    });

    const songName = item.songName || item.SongName || "";
    if (songName) t += `[L]    🎵 ${songName}\n`;

    const isTw = !!(
      item.isTakeaway ||
      item.IsTakeaway ||
      item.isTakeAway ||
      item.IsTakeAway
    );
    if (isTw) t += `[L]    <B>- Takeaway</B>\n`;

    const modifiers = item.modifiers || (item.ModifiersJSON ? JSON.parse(item.ModifiersJSON) : []);
    if (modifiers && modifiers.length > 0) {
      modifiers.forEach((m) => {
        t += `[L]    <B>+ ${m.ModifierName || m.name}</B>\n`;
      });
    }

    const comboSels = item.comboSelections || (item.ComboDetailsJSON ? (() => { try { return JSON.parse(item.ComboDetailsJSON); } catch { return []; } })() : []);
    if (comboSels && comboSels.length > 0) {
      comboSels.forEach((g) => {
        const comboItems = g.items || g.Items || [];
        if (comboItems.length > 0) {
          comboItems.forEach((opt) => {
            t += `[L]<font size='big'>    - ${opt.name || opt.Name}</font>\n`;
          });
        }
      });
    }

    const noteText = item.note || item.notes || item.Remarks || item.remarks;
    if (noteText) t += `[L]    * NOTE: ${noteText}\n`;

    return t;
  };

  if (type === "KDS_PRINT") {
    const kitchenGroups = {};
    itemsForPrinter.forEach((item) => {
      const kName = (
        item.PrinterName ||
        item.KitchenTypeName ||
        item.kitchenTypeName ||
        item.dishGroupName ||
        item.categoryName ||
        "KITCHEN"
      )
        .toUpperCase()
        .trim();
      if (!kitchenGroups[kName]) kitchenGroups[kName] = [];
      kitchenGroups[kName].push(item);
    });

    for (const [kName, groupItems] of Object.entries(kitchenGroups)) {
      text += `\n[L]<B>${kName}</B>\n`;
      text += "[L]--------------------------------\n";
      groupItems.forEach((item) => {
        text += renderThermalItem(item);
      });
      text += "[L]--------------------------------\n";
    }
  } else {
    itemsForPrinter.forEach((item) => {
      text += renderThermalItem(item);
    });
    text += "[L]--------------------------------\n";
  }

  text += `[L]Order By: ${waiter}\n`;
  text += `[L]Order #: ${orderNo}\n`;

  if (kitchenName && kitchenName !== "KDS") {
    text += "[L]--------------------------------\n";
    text += `[C]<font size='big'><B>${kitchenName.toUpperCase()}</B></font>\n`;
  }

  text += "\n\n";
  return text;
}

async function generateAndQueueKOTs(orderId) {
  try {
    const pool = await poolPromise;

    // 1. Load Order Header
    const orderRes = await pool.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
        SELECT TOP 1 h.OrderId, h.OrderNumber, LTRIM(RTRIM(h.Tableno)) as tableNo, h.CreatedBy
        FROM RestaurantOrderCur h
        WHERE h.OrderNumber = @orderNo
      `);
    
    if (orderRes.recordset.length === 0) {
        console.log(`[generateAndQueueKOTs] EARLY EXIT: Order '${orderId}' not found in RestaurantOrderCur.`);
        return;
    }
    const orderHeader = orderRes.recordset[0];
    console.log(`[generateAndQueueKOTs] Order found: ${orderHeader.OrderNumber} (TableNo: ${orderHeader.tableNo})`);

    // 2. Load Items & Resolve Printer
    const itemsRes = await pool.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
        SELECT 
          d.OrderDetailId as lineItemId, d.DishId as id, d.Quantity as qty, 
          dish.Name as name, d.Remarks as note, d.ModifiersJSON, d.isTakeAway,
          d.ComboDetailsJSON,
          ISNULL(ckt.KitchenTypeName, cat.CategoryName) as KitchenTypeName,
          pm.PrinterName,
          pm.PrinterPath as PrinterIP,
          pm.IsActive as IsPrinterEnabled
        FROM RestaurantOrderDetailCur d 
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
        LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
        LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
        LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.PrinterType = 2
        WHERE h.OrderNumber = @orderNo
        AND d.StatusCode = 1
      `);

    const items = itemsRes.recordset;
    console.log(`[generateAndQueueKOTs] Items loaded: ${items.length} item(s) with StatusCode = 1`);
    items.forEach((item, idx) => {
        console.log(`  [item ${idx + 1}] name='${item.name}' PrinterName='${item.PrinterName}' PrinterIP='${item.PrinterIP}' IsPrinterEnabled=${item.IsPrinterEnabled} StatusCode=1`);
    });
    if (items.length === 0) {
        console.log(`[generateAndQueueKOTs] EARLY EXIT: No items with StatusCode=1 for order '${orderId}'.`);
        return;
    }

    // 3. Group Items by Printer Name (to keep KOT slips separated by kitchen type)
    let fallbackKitchenIp = '192.168.68.184';
    try {
        const fallbackRes = await pool.request().query(`
            SELECT TOP 1 PrinterPath 
            FROM PrintMaster 
            WHERE PrinterType = 2 AND IsActive = 1 AND PrinterPath IS NOT NULL AND PrinterPath <> ''
        `);
        if (fallbackRes.recordset.length > 0) {
            fallbackKitchenIp = fallbackRes.recordset[0].PrinterPath;
        }
    } catch (err) {
        console.error("[generateAndQueueKOTs] Fallback IP fetch error:", err.message);
    }

    const printerGroups = {};
    items.forEach(item => {
        if (item.IsPrinterEnabled === 0 || item.IsPrinterEnabled === false) {
            console.log(`[generateAndQueueKOTs] SKIPPED item '${item.name}': IsPrinterEnabled=${item.IsPrinterEnabled}`);
            return;
        }
        const pName = item.PrinterName || 'Kitchen Printer';
        const ip = item.PrinterIP || fallbackKitchenIp;
        if (!item.PrinterName) console.log(`[generateAndQueueKOTs] WARNING: item '${item.name}' has no PrinterName → using fallback '${pName}'`);
        if (!item.PrinterIP)   console.log(`[generateAndQueueKOTs] WARNING: item '${item.name}' has no PrinterIP → using fallback '${ip}'`);
        
        if (!printerGroups[pName]) {
            printerGroups[pName] = {
                printerName: pName,
                printerIp: ip,
                items: []
            };
        }
        printerGroups[pName].items.push(item);
    });
    const groupKeys = Object.keys(printerGroups);
    console.log(`[generateAndQueueKOTs] Printer groups formed: [${groupKeys.join(', ')}]`);
    if (groupKeys.length === 0) {
        console.log(`[generateAndQueueKOTs] EARLY EXIT: All items were skipped (IsPrinterEnabled=0). Nothing to queue.`);
        return;
    }

    // 4. Generate Thermal Content & Insert into PrintJobQueue
    for (const [pName, group] of Object.entries(printerGroups)) {
        let ip;
        try {
            const orderData = {
                orderId: orderHeader.OrderId,
                orderNo: orderHeader.OrderNumber,
                tableNo: orderHeader.tableNo,
                waiterName: "QR POS", // Since it's from QR
                kitchenName: group.printerName
            };

            const dupCheck = await pool.request()
                .input('PrinterName', sql.NVarChar(100), group.printerName)
                .input('SearchText', sql.NVarChar(100), `%Order #: ${orderHeader.OrderNumber}%`)
                .query(`
                    SELECT JobId, Status 
                    FROM PrintJobQueue 
                    WHERE PrinterName = @PrinterName
                      AND Content LIKE @SearchText
                `);

            let kotType = "NEW_ORDER";
            
            if (dupCheck.recordset.length > 0) {
                // If it already exists in the queue (even if pending or completed), it's an additional order for this kitchen
                kotType = "ADDITIONAL";
            }

            const thermalText = formatKOTThermalText(orderData, group.items, kotType);
            ip = group.printerIp;
            const storeId = "STORE_001"; // Consistent with UniversalPrinter.js

            console.log(`[generateAndQueueKOTs] Processing group: Printer='${group.printerName}' IP='${ip}' Items=${group.items.length} Type=${kotType}`);

            const jobId = crypto.randomUUID();
            console.log(`[generateAndQueueKOTs] Inserting PrintJobQueue: JobId=${jobId} Printer=${group.printerName} IP=${ip} ContentLen=${thermalText.length}`);

            await pool.request()
                .input('JobId', sql.UniqueIdentifier, jobId)
                .input('StoreId', sql.NVarChar(50), storeId)
                .input('PrinterName', sql.NVarChar(100), group.printerName)
                .input('PrinterIp', sql.NVarChar(100), ip)
                .input('PrinterPort', sql.Int, 9100)
                .input('Content', sql.NVarChar(sql.MAX), thermalText)
                .query(`
                    INSERT INTO PrintJobQueue (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn, Attempts)
                    VALUES (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE(), 0)
                `);
            console.log(`[generateAndQueueKOTs] INSERT SUCCESS: KOT job ${jobId} queued for IP ${ip}`);

        } catch (innerErr) {
            console.error("\n================ KOT QUEUE ERROR ================");
            console.error(`Order   : ${orderHeader?.OrderNumber || orderId}`);
            console.error(`Printer : ${group?.printerName || 'Unknown'}`);
            console.error(`IP      : ${ip || group?.printerIp || 'Unknown'}`);
            console.error(`StoreId : STORE_001`);
            console.error(`Error   : ${innerErr.message}`);
            console.error(innerErr.stack);
            console.error("=================================================\n");
        }
    }

    // 5. Generate KDS backup print (PrinterType = 4) containing all items
    try {
        const kdsPrinterRes = await pool.request()
            .query(`
                SELECT TOP 1 PrinterPath as PrinterIP, PrinterName 
                FROM PrintMaster 
                WHERE PrinterType = 4 AND IsActive = 1 AND PrinterPath IS NOT NULL AND PrinterPath <> ''
            `);
        
        if (kdsPrinterRes.recordset.length > 0) {
            const kdsPrinter = kdsPrinterRes.recordset[0];
            const kdsIp = kdsPrinter.PrinterIP;

            const orderData = {
                orderId: orderHeader.OrderId,
                orderNo: orderHeader.OrderNumber,
                tableNo: orderHeader.tableNo,
                waiterName: "QR POS",
                kitchenName: "KDS"
            };

            const kdsDupCheck = await pool.request()
                .input('PrinterName', sql.NVarChar(100), kdsPrinter.PrinterName)
                .input('SearchText', sql.NVarChar(100), `%Order #: ${orderHeader.OrderNumber}%`)
                .query(`
                    SELECT TOP 1 JobId 
                    FROM PrintJobQueue 
                    WHERE PrinterName = @PrinterName 
                      AND Content LIKE @SearchText
                `);
            
            let kdsKotType = "KDS_PRINT";
            if (kdsDupCheck.recordset.length > 0) {
                kdsKotType = "ADDITIONAL_KDS_PRINT";
            }

            const kdsThermalText = formatKOTThermalText(orderData, items, kdsKotType); 
            const storeId = "STORE_001";

            const kdsJobId = crypto.randomUUID();
            await pool.request()
                .input('JobId', sql.UniqueIdentifier, kdsJobId)
                .input('StoreId', sql.NVarChar(50), storeId)
                .input('PrinterName', sql.NVarChar(100), kdsPrinter.PrinterName)
                .input('PrinterIp', sql.NVarChar(100), kdsIp)
                .input('PrinterPort', sql.Int, 9100)
                .input('Content', sql.NVarChar(sql.MAX), kdsThermalText)
                .query(`
                    INSERT INTO PrintJobQueue (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn, Attempts)
                    VALUES (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE(), 0)
                `);
            console.log(`[generateAndQueueKOTs] Queued KDS job ${kdsJobId} for IP ${kdsIp}`);
        }
    } catch (kdsErr) {
        console.error("[generateAndQueueKOTs] KDS backup print queue error:", kdsErr.message);
    }

  } catch (err) {
      console.error("\n================ KOT QUEUE FATAL ERROR ================");
      console.error(`OrderId : ${orderId}`);
      console.error(`Error   : ${err.message}`);
      console.error(err.stack);
      console.error("=======================================================\n");
  }
}

async function generateAndQueueReceipt(orderId, paymentMode = 'ONLINE') {
  try {
    const pool = await poolPromise;

    // 1. Get Order Header + Totals
    const orderHeaderRes = await pool.request()
        .input("orderNo", sql.NVarChar(50), orderId)
        .query(`
            SELECT TOP 1 h.OrderId, h.OrderNumber, LTRIM(RTRIM(h.Tableno)) as tableNo, 
                   h.TotalAmount, h.ServiceCharge as ServiceChargeAmount, h.TotalTax as GstAmount, 
                   h.DiscountAmount, h.DiscountPercentage as DiscountValue
            FROM RestaurantOrderCur h
            WHERE h.OrderNumber = @orderNo
        `);
      
    if (orderHeaderRes.recordset.length === 0) return;
    const orderHeader = orderHeaderRes.recordset[0];

    // 2. Get Items
    const itemsRes = await pool.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
        SELECT d.Quantity as qty, dish.Name as name, d.PricePerUnit as price, d.ModifiersJSON, d.isTakeAway, d.ComboDetailsJSON
        FROM RestaurantOrderDetailCur d 
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        WHERE h.OrderNumber = @orderNo AND d.StatusCode NOT IN (0)
      `);
    const items = itemsRes.recordset.map(item => ({
       ...item,
       modifiers: item.ModifiersJSON ? JSON.parse(item.ModifiersJSON) : []
    }));

    // 3. Get Company details (AppSettings + Organization)
    const appSettingsRes = await pool.request().query("SELECT TOP 1 ShopName FROM AppSettings");
    const orgRes = await pool.request().query("SELECT TOP 1 Name, Address1_Line1, Address1_Telephone1, GstRegno FROM Organization");
    
    const appRow = appSettingsRes.recordset[0] || {};
    const orgRow = orgRes.recordset[0] || {};
    
    const company = {
        name: appRow.ShopName || orgRow.Name || "POS SYSTEM",
        address: orgRow.Address1_Line1 || "",
        gstNo: orgRow.GstRegno || "",
        tel: orgRow.Address1_Telephone1 || "",
        currencySymbol: "₹"
    };

    // 4. Determine Printer Type
    const isTakeaway = String(orderHeader.tableNo).toUpperCase().startsWith('TW') || 
                       String(orderHeader.tableNo).toUpperCase() === 'TAKEAWAY';
    const pType = isTakeaway ? 3 : 1;

    // 5. Fetch Printer IP
    let printerIp = '192.168.68.178';
    let printerName = 'Counter Printer';
    
    const printerRes = await pool.request()
        .input('PrinterType', sql.Int, pType)
        .query(`SELECT TOP 1 PrinterIP, PrinterName FROM PrintMaster WHERE PrinterType = @PrinterType AND IsActive = 1`);
        
    if (printerRes.recordset.length > 0 && printerRes.recordset[0].PrinterIP) {
        printerIp = printerRes.recordset[0].PrinterIP;
        printerName = printerRes.recordset[0].PrinterName;
    } else {
        // Ultimate fallback to Cashier
        const cashierRes = await pool.request()
            .query(`SELECT TOP 1 PrinterIP, PrinterName FROM PrintMaster WHERE PrinterType = 1 AND IsActive = 1`);
        if (cashierRes.recordset.length > 0 && cashierRes.recordset[0].PrinterIP) {
            printerIp = cashierRes.recordset[0].PrinterIP;
            printerName = cashierRes.recordset[0].PrinterName;
        }
    }

    // 6. Format Thermal Text
    const saleData = {
        tableNo: orderHeader.tableNo,
        orderNo: orderHeader.OrderNumber,
        items: items,
        subtotal: (orderHeader.TotalAmount || 0) - (orderHeader.ServiceChargeAmount || 0) - (orderHeader.GstAmount || 0) + (orderHeader.DiscountAmount || 0),
        serviceCharge: orderHeader.ServiceChargeAmount || 0,
        gst: orderHeader.GstAmount || 0,
        total: orderHeader.TotalAmount || 0,
        payMode: paymentMode,
        paidAmount: orderHeader.TotalAmount || 0
    };
    
    const discountInfo = {
        applied: (orderHeader.DiscountAmount || 0) > 0,
        amount: orderHeader.DiscountAmount || 0,
        type: 'flat',
        value: orderHeader.DiscountValue || orderHeader.DiscountAmount || 0
    };

    const thermalText = formatThermalTextWithDiscount(saleData, company, discountInfo);

    // Duplicate Check
    const dupCheck = await pool.request()
        .input('PrinterIp', sql.NVarChar(100), printerIp)
        .input('SearchText', sql.NVarChar(100), `%Order #: ${orderHeader.OrderNumber}%`)
        .query(`
            SELECT TOP 1 JobId 
            FROM PrintJobQueue 
            WHERE PrinterIp = @PrinterIp 
              AND Status IN ('PENDING', 'PROCESSING') 
              AND Content LIKE @SearchText
              AND Content LIKE '%Payment:%'
        `);

    if (dupCheck.recordset.length > 0) {
        console.log(`[generateAndQueueReceipt] Skip: Duplicate receipt for Order ${orderHeader.OrderNumber}`);
        return;
    }

    const jobId = crypto.randomUUID();
    const storeId = "STORE_001";

    await pool.request()
        .input('JobId', sql.UniqueIdentifier, jobId)
        .input('StoreId', sql.NVarChar(50), storeId)
        .input('PrinterName', sql.NVarChar(100), printerName)
        .input('PrinterIp', sql.NVarChar(100), printerIp)
        .input('PrinterPort', sql.Int, 9100)
        .input('Content', sql.NVarChar(sql.MAX), thermalText)
        .query(`
            INSERT INTO PrintJobQueue (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn, Attempts)
            VALUES (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE(), 0)
        `);
    
    console.log(`[generateAndQueueReceipt] Queued Receipt job ${jobId} for IP ${printerIp}`);

} catch (err) {
      console.error("[generateAndQueueReceipt] Error:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual KOT Reprint — prints ALL items (StatusCode 1 or 2) as REPRINT
// Used by cashier/waiter for KDS reprint
// ─────────────────────────────────────────────────────────────────────────────
async function reprintKOT(orderId) {
  try {
    const pool = await poolPromise;

    const orderRes = await pool.request()
      .input('orderNo', sql.NVarChar(50), orderId)
      .query(`SELECT TOP 1 h.OrderId, h.OrderNumber, LTRIM(RTRIM(h.Tableno)) as tableNo FROM RestaurantOrderCur h WHERE h.OrderNumber = @orderNo`);

    if (orderRes.recordset.length === 0) { console.log(`[reprintKOT] Order not found: ${orderId}`); return; }
    const orderHeader = orderRes.recordset[0];

    // Fetch ALL active items (not voided/cancelled)
    const itemsRes = await pool.request()
      .input('orderNo', sql.NVarChar(50), orderId)
      .query(`
        SELECT d.OrderDetailId as lineItemId, d.DishId as id, d.Quantity as qty, 
          dish.Name as name, d.Remarks as note, d.ModifiersJSON, d.isTakeAway, d.ComboDetailsJSON,
          ISNULL(ckt.KitchenTypeName, cat.CategoryName) as KitchenTypeName,
          pm.PrinterName, pm.PrinterPath as PrinterIP, pm.IsActive as IsPrinterEnabled
        FROM RestaurantOrderDetailCur d 
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
        LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
        LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
        LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.PrinterType = 2
        WHERE h.OrderNumber = @orderNo AND d.StatusCode IN (1, 2)
      `);

    const items = itemsRes.recordset;
    if (items.length === 0) { console.log(`[reprintKOT] No items to reprint for order '${orderId}'.`); return; }

    let fallbackIp = '';
    try {
      const fb = await pool.request().query(`SELECT TOP 1 PrinterPath FROM PrintMaster WHERE PrinterType = 2 AND IsActive = 1 AND PrinterPath IS NOT NULL AND PrinterPath <> ''`);
      if (fb.recordset.length > 0) fallbackIp = fb.recordset[0].PrinterPath;
    } catch (_) {}

    // Group by kitchen printer and queue REPRINT
    const groups = {};
    items.forEach(item => {
      if (item.IsPrinterEnabled === 0 || item.IsPrinterEnabled === false) return;
      const pName = item.PrinterName || 'Kitchen Printer';
      const ip = item.PrinterIP || fallbackIp;
      if (!groups[pName]) groups[pName] = { printerName: pName, printerIp: ip, items: [] };
      groups[pName].items.push(item);
    });

    for (const [, group] of Object.entries(groups)) {
      const orderData = { orderId: orderHeader.OrderId, orderNo: orderHeader.OrderNumber, tableNo: orderHeader.tableNo, waiterName: 'QR POS', kitchenName: group.printerName };
      const thermalText = formatKOTThermalText(orderData, group.items, 'REPRINT');
      const jobId = crypto.randomUUID();
      await pool.request()
        .input('JobId', sql.UniqueIdentifier, jobId).input('StoreId', sql.NVarChar(50), 'STORE_001')
        .input('PrinterName', sql.NVarChar(100), group.printerName).input('PrinterIp', sql.NVarChar(100), group.printerIp)
        .input('PrinterPort', sql.Int, 9100).input('Content', sql.NVarChar(sql.MAX), thermalText)
        .query(`INSERT INTO PrintJobQueue (JobId,StoreId,PrinterName,PrinterIp,PrinterPort,Content,Status,CreatedOn,Attempts) VALUES (@JobId,@StoreId,@PrinterName,@PrinterIp,@PrinterPort,@Content,'PENDING',GETDATE(),0)`);
      console.log(`[reprintKOT] Queued REPRINT: Printer='${group.printerName}' IP=${group.printerIp}`);
    }

    // Also queue on KDS (PrinterType=4)
    try {
      const kdsRes = await pool.request().query(`SELECT TOP 1 PrinterPath as PrinterIP, PrinterName FROM PrintMaster WHERE PrinterType = 4 AND IsActive = 1 AND PrinterPath IS NOT NULL AND PrinterPath <> ''`);
      if (kdsRes.recordset.length > 0) {
        const kp = kdsRes.recordset[0];
        const orderData = { orderId: orderHeader.OrderId, orderNo: orderHeader.OrderNumber, tableNo: orderHeader.tableNo, waiterName: 'QR POS', kitchenName: 'KDS' };
        const kdsThermal = formatKOTThermalText(orderData, items, 'REPRINT');
        const kdsJobId = crypto.randomUUID();
        await pool.request()
          .input('JobId', sql.UniqueIdentifier, kdsJobId).input('StoreId', sql.NVarChar(50), 'STORE_001')
          .input('PrinterName', sql.NVarChar(100), kp.PrinterName).input('PrinterIp', sql.NVarChar(100), kp.PrinterIP)
          .input('PrinterPort', sql.Int, 9100).input('Content', sql.NVarChar(sql.MAX), kdsThermal)
          .query(`INSERT INTO PrintJobQueue (JobId,StoreId,PrinterName,PrinterIp,PrinterPort,Content,Status,CreatedOn,Attempts) VALUES (@JobId,@StoreId,@PrinterName,@PrinterIp,@PrinterPort,@Content,'PENDING',GETDATE(),0)`);
        console.log(`[reprintKOT] Queued REPRINT KDS: IP=${kp.PrinterIP}`);
      }
    } catch (kdsErr) { console.error('[reprintKOT] KDS reprint error:', kdsErr.message); }

  } catch (err) {
    console.error('[reprintKOT] Error:', err.message, err.stack);
  }
}

module.exports = {
  generateAndQueueKOTs,
  generateAndQueueReceipt,
  reprintKOT
};
