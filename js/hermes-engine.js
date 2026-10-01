/**
 * HERMES AI ENGINE (Client-Side Simulation Module)
 * Core Logic for Financial Loss Prioritization & Signature Retrieval
 */

class HermesEngine {
    // 1. Financial Impact Predictor ($ Formula)
    static calculateFinancialLoss(downtimeHours, plantRateTH, productPriceUSD) {
        const hours = parseFloat(downtimeHours) || 0;
        const rate = parseFloat(plantRateTH) || 0;
        const price = parseFloat(productPriceUSD) || 0;
        
        const totalLoss = hours * rate * price;
        return {
            totalLossUSD: totalLoss,
            formattedLoss: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalLoss),
            formulaString: `${hours.toFixed(1)} hrs Downtime × ${rate.toFixed(1)} T/H Rate × $${price.toLocaleString()}/Ton`
        };
    }

    // 2. Similar-Incident Retrieval Engine (Signature Matching)
    static getSignatureMatch(incident) {
        const signatureMap = {
            "Coupling": {
                title: "Coupling Misalignment & Soft-Foot",
                matchPercentage: 94,
                refRCA: "RCA-5 (BL-5702 / OPP Plant)",
                guidance: "Perform laser alignment on shaft coupling, verify soft-foot (<0.05 mm), replace over-aged elastomer elements, and shorten vibration route interval.",
                checklist: [
                    "Perform 6-monthly laser alignment & soft-foot check",
                    "Inspect & track elastomer coupling element condition",
                    "Verify vibration trend (< 7.0 mm/s alarm threshold)"
                ]
            },
            "Bearing": {
                title: "Bearing Distress & Lubrication Degradation",
                matchPercentage: 91,
                refRCA: "RCA-2 (KO-3201 / ZCU) & RCA-3 (PM-4405B / NUP)",
                guidance: "Check lube-oil water contamination (<500 ppm), inspect Babbitt layer/journal wear, and switch re-greasing interval to risk-based cadence.",
                checklist: [
                    "Inspect DE/NDE journal bearing clearances & Babbitt layer",
                    "Verify online water-in-oil sensor / sample purity (< 500 ppm)",
                    "Establish risk-based re-greasing PM schedule"
                ]
            },
            "Seal": {
                title: "Mechanical Seal Dry-Running & NPSH Transient",
                matchPercentage: 88,
                refRCA: "RCA-1 (PU-2101B / ARP Plant)",
                guidance: "Verify Plan 11 seal-flush flow (>6 L/min), inspect suction pressure during feed-swings, and ensure low-NPSH trip interlocks are active in DCS.",
                checklist: [
                    "Install seal-flush flow switch with DCS alarm",
                    "Add low-NPSH / loss-of-flush trip interlock in DCS",
                    "Update feed-swing SOP to cap ramp rate"
                ]
            },
            "Fouling": {
                title: "Tube Bundle Coke/Polymer Fouling & High dP",
                matchPercentage: 89,
                refRCA: "RCA-4 (HE-3301 / ZCU Plant)",
                guidance: "Monitor tube-side dP trend (<0.6 bar limit), inspect feed heavy-ends filtration (<1.5%), and execute hydro-jet bundle cleaning at dP trigger.",
                checklist: [
                    "Configure dP-based cleaning trigger & alarm",
                    "Tighten feed heavy-ends filtration upstream",
                    "Incorporate fouling factor KPI into dashboard"
                ]
            }
        };

        const title = (incident.risk_title || incident.title || incident.failure_signature || "").toLowerCase();
        
        if (title.includes("coupling") || title.includes("vibration")) return signatureMap["Coupling"];
        if (title.includes("bearing") || title.includes("motor")) return signatureMap["Bearing"];
        if (title.includes("seal") || title.includes("pump")) return signatureMap["Seal"];
        if (title.includes("fouling") || title.includes("heat") || title.includes("exchanger")) return signatureMap["Fouling"];

        return {
            title: "Standard Failure Pattern Match",
            matchPercentage: 85,
            refRCA: "Historical Incident Database",
            guidance: "Review historical maintenance logs, verify operating parameters against design spec, and follow standard RCA/CAPA procedures.",
            checklist: [
                "Verify sensor baseline & alarm thresholds",
                "Execute field inspection with assigned discipline team",
                "Update PM checklist upon risk closure"
            ]
        };
    }
}