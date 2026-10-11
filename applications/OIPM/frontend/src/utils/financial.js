export const SAVING_TYPE_OPTIONS = [
    { value: "recurring", label: "Recurring Saving" },
    { value: "limited", label: "Limited Period Saving" },
    { value: "one_time", label: "One-Time Saving" },
];

export function normalizeSavingType(value) {
    const raw = String(value || "recurring").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
    if (["limited_period", "limited_period_saving", "temporary"].includes(raw)) return "limited";
    if (["one_time_saving", "onetime", "oneoff"].includes(raw)) return "one_time";
    return raw === "one_time" || raw === "limited" ? raw : "recurring";
}

export function calculateRowSaving(row) {
    const type = normalizeSavingType(row?.saving_type);
    if (type === "one_time") return 0;
    const before = Number(row?.before);
    const after = Number(row?.after);
    if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
    return Math.max(0, before - after);
}

export function getMonthlySaving(items = []) {
    return items.reduce((sum, item) => sum + calculateRowSaving(item), 0);
}

export function getOneTimeSaving(items = []) {
    return items.reduce((sum, item) => {
        return sum + (normalizeSavingType(item?.saving_type) === "one_time" ? Number(item?.one_time_saving) || 0 : 0);
    }, 0);
}

export function formatDuration(months) {
    const value = Number(months);
    if (!Number.isFinite(value) || value <= 0) return "";
    const whole = Math.floor(value);
    const years = Math.floor(whole / 12);
    const remainingMonths = whole % 12;
    const parts = [];
    if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
    if (remainingMonths) parts.push(`${remainingMonths} ${remainingMonths === 1 ? "month" : "months"}`);
    return parts.join(" ") || "0 months";
}

export function calculatePaybackPeriod(investmentAmount, items = []) {
    const investment = Number(investmentAmount);
    if (!Number.isFinite(investment) || investment <= 0) return "";

    const monthly = getMonthlySaving(items);
    const oneTime = getOneTimeSaving(items);

    // Recurring / limited-period monthly saving is the payback basis whenever
    // a monthly saving exists. A one-time saving is used when there is no
    // monthly saving at all.
    const saving = monthly > 0 ? monthly : oneTime;
    if (!Number.isFinite(saving) || saving <= 0) return "";

    const totalDays = Math.round((investment / saving) * 30);
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const parts = [];

    if (months) {
        parts.push(`${months} ${months === 1 ? "month" : "months"}`);
    }
    if (days || !parts.length) {
        parts.push(`${days} ${days === 1 ? "day" : "days"}`);
    }

    return parts.join(" ");
}

export function getApplicableAnnualSaving(startDateValue, items = []) {
    // Kept in the signature because existing callers pass the Kaizen start date.
    void startDateValue;

    if (!Array.isArray(items) || items.length === 0) return 0;

    // Applicable saving depends on the saving type:
    // Recurring      -> monthly saving x 12
    // Limited period -> monthly saving x selected duration
    // One-time       -> one-time saving
    //
    // The function name is kept for compatibility with the existing UI.
    return items.reduce((total, item) => {
        const type = normalizeSavingType(item?.saving_type);

        if (type === "one_time") {
            return total + (Number(item?.one_time_saving) || 0);
        }

        const storedMonthly = Number(item?.monthly_saving);
        const monthlySaving = Number.isFinite(storedMonthly)
            ? storedMonthly
            : calculateRowSaving(item);

        if (!Number.isFinite(monthlySaving) || monthlySaving <= 0) {
            return total;
        }

        if (type === "limited") {
            const duration = Number(item?.duration_months);
            if (!Number.isFinite(duration) || duration <= 0) {
                return total;
            }

            return total + monthlySaving * duration;
        }

        return total + monthlySaving * 12;
    }, 0);
}

export function savingForMonth(startDateValue, items = [], year, month) {
    if (!startDateValue) return 0;
    const start = new Date(`${String(startDateValue).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(start.getTime())) return 0;
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const currentMonth = new Date(year, month - 1, 1);
    if (currentMonth < startMonth) return 0;
    const monthsSinceStart = (year - start.getFullYear()) * 12 + (month - 1 - start.getMonth());

    return items.reduce((sum, item) => {
        const type = normalizeSavingType(item?.saving_type);
        if (type === "one_time") {
            return sum + (monthsSinceStart === 0 ? Number(item?.one_time_saving) || 0 : 0);
        }
        if (type === "recurring") return sum + (Number(item?.monthly_saving) || calculateRowSaving(item));
        const duration = Number(item?.duration_months) || 0;
        return sum + (monthsSinceStart >= 0 && monthsSinceStart < duration
            ? Number(item?.monthly_saving) || calculateRowSaving(item)
            : 0);
    }, 0);
}

export function savingForFinancialYear(startDateValue, items = [], fyStartYear) {
    let total = 0;
    for (let offset = 0; offset < 12; offset += 1) {
        const rawMonth = 4 + offset;
        const year = rawMonth <= 12 ? fyStartYear : fyStartYear + 1;
        const month = rawMonth <= 12 ? rawMonth : rawMonth - 12;
        total += savingForMonth(startDateValue, items, year, month);
    }
    return Math.round(total * 100) / 100;
}
