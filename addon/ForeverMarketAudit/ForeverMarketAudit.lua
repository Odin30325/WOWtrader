-- =============================================================================
-- ForeverMarketAudit.lua — Addon Oficial del Clan para WoW: Forever (1.60.1_70399)
-- Interface: 106001 | API Moderna: C_AuctionHouse (Commodities + Item Search)
-- 100% ToS-Compliant: Solo lectura de eventos y visualización en Tooltips
-- =============================================================================

local ADDON_NAME = "ForeverMarketAudit"
local FMA = CreateFrame("Frame", "ForeverMarketAuditFrame")

-- Inicializar SavedVariables
ForeverMarketAuditDB = ForeverMarketAuditDB or {
    meta = {
        player = "Desconocido",
        faction = "Alliance",
        houseId = 110,
        region = "us",
        version = "1.0.0",
        lastScanTime = 0,
    },
    latestItems = {},
}

-- Formateador de cobre a texto con iconos de moneda de WoW
local function FormatMoneyCopper(copperAmount)
    if not copperAmount or copperAmount <= 0 then
        return "|cff888888Sin datos|r"
    end
    local negative = copperAmount < 0
    local absVal = math.floor(math.abs(copperAmount) + 0.5)
    local gold = math.floor(absVal / 10000)
    local silver = math.floor((absVal % 10000) / 100)
    local copper = absVal % 100

    local str = ""
    if gold > 0 then
        str = str .. string.format("|cffffd100%dg|r ", gold)
    end
    if silver > 0 or gold > 0 then
        str = str .. string.format("|cffe6e6e6%02ds|r ", silver)
    end
    str = str .. string.format("|cffeda55f%02dc|r", copper)

    if negative then
        return "|cffff4444-" .. str .. "|r"
    end
    return str
end

-- Algoritmo Anti-Manipulación en Lua (Cálculo de P10 y Mediana ponderada por cantidad)
local function ComputeWeightedStats(offers)
    if not offers or #offers == 0 then
        return nil
    end

    table.sort(offers, function(a, b)
        return a.unitPrice < b.unitPrice
    end)

    local totalQty = 0
    for i = 1, #offers do
        totalQty = totalQty + (offers[i].quantity or 1)
    end

    if totalQty <= 0 then
        return nil
    end

    local minPrice = offers[1].unitPrice
    local targetP10 = math.max(1, math.floor(0.10 * totalQty))
    local targetMedian = math.max(1, math.floor(0.50 * totalQty))

    local acc = 0
    local p10Price = minPrice
    local p10Found = false
    local medianPrice = minPrice

    for i = 1, #offers do
        acc = acc + (offers[i].quantity or 1)
        if not p10Found and acc >= targetP10 then
            p10Price = offers[i].unitPrice
            p10Found = true
        end
        if acc >= targetMedian then
            medianPrice = offers[i].unitPrice
            break
        end
    end

    return {
        minPrice = minPrice,
        p10Price = p10Price,
        medianPrice = medianPrice,
        totalQuantity = totalQty,
        numListings = #offers,
    }
end

-- Actualizar metadatos del jugador al entrar al mundo o abrir la AH
local function UpdatePlayerMetadata()
    ForeverMarketAuditDB.meta = ForeverMarketAuditDB.meta or {}
    ForeverMarketAuditDB.meta.player = UnitName("player") or "Odin"
    ForeverMarketAuditDB.meta.faction = UnitFactionGroup("player") or "Alliance"
    ForeverMarketAuditDB.meta.houseId = ForeverMarketAuditDB.meta.houseId or 110
    ForeverMarketAuditDB.meta.region = "us"
    ForeverMarketAuditDB.meta.version = "1.0.0"
end

-- 1. Captura de Materias Primas (Commodities: menas, hierbas, telas, consumibles C-GUR / EZ-Thro)
local function OnCommoditySearchResultsUpdated(itemID)
    if not itemID or not C_AuctionHouse or not C_AuctionHouse.GetNumCommoditySearchResults then
        return
    end

    local numResults = C_AuctionHouse.GetNumCommoditySearchResults(itemID)
    if not numResults or numResults <= 0 then
        return
    end

    local offers = {}
    for i = 1, numResults do
        local res = C_AuctionHouse.GetCommoditySearchResultInfo(itemID, i)
        if res and res.unitPrice and res.unitPrice > 0 and res.quantity and res.quantity > 0 then
            table.insert(offers, {
                unitPrice = res.unitPrice,
                quantity = res.quantity,
            })
        end
    end

    local stats = ComputeWeightedStats(offers)
    if stats then
        local now = GetServerTime and GetServerTime() or time()
        ForeverMarketAuditDB.meta.lastScanTime = now
        ForeverMarketAuditDB.latestItems = ForeverMarketAuditDB.latestItems or {}
        ForeverMarketAuditDB.latestItems[itemID] = {
            minPrice = stats.minPrice,
            p10Price = stats.p10Price,
            medianPrice = stats.medianPrice,
            totalQuantity = stats.totalQuantity,
            numListings = stats.numListings,
            timestamp = now,
            offers = offers,
        }
    end
end

-- 2. Captura de Equipo y Objetos No Apilables (cotizan con buyoutAmount)
local function OnItemSearchResultsUpdated(itemKey)
    if not itemKey or not itemKey.itemID or not C_AuctionHouse or not C_AuctionHouse.GetNumItemSearchResults then
        return
    end

    local itemID = itemKey.itemID
    local numResults = C_AuctionHouse.GetNumItemSearchResults(itemKey)
    if not numResults or numResults <= 0 then
        return
    end

    local offers = {}
    for i = 1, numResults do
        local res = C_AuctionHouse.GetItemSearchResultInfo(itemKey, i)
        if res and res.buyoutAmount and res.buyoutAmount > 0 then
            local qty = math.max(1, res.quantity or 1)
            table.insert(offers, {
                unitPrice = math.floor(res.buyoutAmount / qty),
                quantity = qty,
            })
        end
    end

    local stats = ComputeWeightedStats(offers)
    if stats then
        local now = GetServerTime and GetServerTime() or time()
        ForeverMarketAuditDB.meta.lastScanTime = now
        ForeverMarketAuditDB.latestItems = ForeverMarketAuditDB.latestItems or {}
        ForeverMarketAuditDB.latestItems[itemID] = {
            minPrice = stats.minPrice,
            p10Price = stats.p10Price,
            medianPrice = stats.medianPrice,
            totalQuantity = stats.totalQuantity,
            numListings = stats.numListings,
            timestamp = now,
            offers = offers,
        }
    end
end

-- 3. Inyección de Inteligencia Horaria en los Tooltips del Juego
local function AppendMarketTooltip(tooltip, itemID)
    if not tooltip or not itemID or itemID <= 0 then
        return
    end

    local webData = ForeverMarketData and ForeverMarketData.items and ForeverMarketData.items[itemID]
    local localScan = ForeverMarketAuditDB and ForeverMarketAuditDB.latestItems and ForeverMarketAuditDB.latestItems[itemID]

    if not webData and not localScan then
        return
    end

    tooltip:AddLine(" ")
    tooltip:AddLine("|cff00ccff[Forever Market Audit — Inteligencia de Clan]|r")

    if webData then
        tooltip:AddDoubleLine(
            "  Suelo Real (P10 Anti-Bait):",
            FormatMoneyCopper(webData.p10),
            0.85, 0.85, 0.85, 1, 1, 1
        )
        tooltip:AddDoubleLine(
            "  Mediana / Liquidez:",
            string.format("%s |cffaaaaaa(%d uds)|r", FormatMoneyCopper(webData.median), webData.qty or 0),
            0.85, 0.85, 0.85, 1, 1, 1
        )
        tooltip:AddDoubleLine(
            string.format("  |cff22c55eCompra Valle (%02d:00 UTC):|r", webData.valleyH or 6),
            FormatMoneyCopper(webData.valleyP10),
            0.85, 0.85, 0.85, 1, 1, 1
        )
        tooltip:AddDoubleLine(
            string.format("  |cfff59e0bVenta Pico (%02d:00 UTC):|r", webData.peakH or 21),
            FormatMoneyCopper(webData.peakP10),
            0.85, 0.85, 0.85, 1, 1, 1
        )

        local roiColor = (webData.roi and webData.roi > 0) and "|cff22c55e+" or "|cffff4444"
        tooltip:AddDoubleLine(
            "  Arbitraje Neto (tras 5% AH):",
            string.format("%s (%s%.1f%% ROI)|r", FormatMoneyCopper(webData.netProfit), roiColor, webData.roi or 0),
            0.85, 0.85, 0.85, 1, 1, 1
        )

        if webData.bait then
            tooltip:AddLine(
                string.format("  |cffff4444¡ALERTA BAIT! Mínimo engañoso en %s (Usa P10)|r", FormatMoneyCopper(webData.min))
            )
        end
    end

    if localScan then
        tooltip:AddDoubleLine(
            "  |cff38bdf8Último Escaneo Local (P10):|r",
            string.format("%s |cffaaaaaa(%d uds)|r", FormatMoneyCopper(localScan.p10Price), localScan.totalQuantity or 0),
            0.85, 0.85, 0.85, 1, 1, 1
        )
    end

    tooltip:Show()
end

-- Registro compatible con el cliente moderno 1.60.1_70399 (Interface 106001)
local function SetupTooltipHooks()
    if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
            if data and data.id then
                AppendMarketTooltip(tooltip, data.id)
            end
        end)
    else
        local function HookLegacyTooltip(tt)
            if not tt or not tt.HookScript then return end
            tt:HookScript("OnTooltipSetItem", function(self)
                local _, link = self:GetItem()
                if link then
                    local itemID = tonumber(string.match(link, "item:(%d+)"))
                    if itemID then
                        AppendMarketTooltip(self, itemID)
                    end
                end
            end)
        end
        HookLegacyTooltip(GameTooltip)
        HookLegacyTooltip(ItemRefTooltip)
    end
end

-- Eventos principales del Addon
FMA:RegisterEvent("PLAYER_LOGIN")
FMA:RegisterEvent("AUCTION_HOUSE_SHOW")
FMA:RegisterEvent("COMMODITY_SEARCH_RESULTS_UPDATED")
FMA:RegisterEvent("ITEM_SEARCH_RESULTS_UPDATED")

FMA:SetScript("OnEvent", function(self, event, ...)
    if event == "PLAYER_LOGIN" then
        UpdatePlayerMetadata()
        SetupTooltipHooks()
        local webCount = (ForeverMarketData and ForeverMarketData.totalItems) or 0
        print(string.format(
            "|cff00ccff[ForeverMarketAudit]|r Cargado v1.0.0 (Interface 106001). Base Web: |cff22c55e%d ítems|r. Usa |cffffd100/fma|r para estado.",
            webCount
        ))
    elseif event == "AUCTION_HOUSE_SHOW" then
        UpdatePlayerMetadata()
    elseif event == "COMMODITY_SEARCH_RESULTS_UPDATED" then
        local itemID = ...
        OnCommoditySearchResultsUpdated(itemID)
    elseif event == "ITEM_SEARCH_RESULTS_UPDATED" then
        local itemKey = ...
        OnItemSearchResultsUpdated(itemKey)
    end
end)

-- Comandos Slash (/fma o /forevermarket)
SLASH_FOREVERMARKETAUDIT1 = "/fma"
SLASH_FOREVERMARKETAUDIT2 = "/forevermarket"
SlashCmdList["FOREVERMARKETAUDIT"] = function(msg)
    local scannedCount = 0
    if ForeverMarketAuditDB and ForeverMarketAuditDB.latestItems then
        for _ in pairs(ForeverMarketAuditDB.latestItems) do
            scannedCount = scannedCount + 1
        end
    end
    local webCount = (ForeverMarketData and ForeverMarketData.totalItems) or 0
    print("|cff00ccff=== Forever Market Audit (Clan Edition) ===|r")
    print(string.format("  Jugador: |cffffd100%s|r | House ID: |cffffd100%d|r", ForeverMarketAuditDB.meta.player or "Odin", ForeverMarketAuditDB.meta.houseId or 110))
    print(string.format("  Ítems en Base Web (ForeverMarketData.lua): |cff22c55e%d|r", webCount))
    print(string.format("  Ítems escaneados en esta sesión: |cff38bdf8%d|r", scannedCount))
    print("  Haz |cffffd100/reload|r antes de subir tu |cffffd100ForeverMarketAudit.lua|r en la Zona del Clan.")
end
