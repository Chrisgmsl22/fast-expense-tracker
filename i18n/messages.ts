import type { Locale } from "./config";

import enAuth from "@/messages/en/auth.json";
import enCategories from "@/messages/en/categories.json";
import enCategory from "@/messages/en/category.json";
import enCommon from "@/messages/en/common.json";
import enDashboard from "@/messages/en/dashboard.json";
import enExpenses from "@/messages/en/expenses.json";
import enIncome from "@/messages/en/income.json";
import enMoney from "@/messages/en/money.json";
import enMovements from "@/messages/en/movements.json";
import enNav from "@/messages/en/nav.json";
import enSettings from "@/messages/en/settings.json";
import enSettlement from "@/messages/en/settlement.json";
import esAuth from "@/messages/es/auth.json";
import esCategories from "@/messages/es/categories.json";
import esCategory from "@/messages/es/category.json";
import esCommon from "@/messages/es/common.json";
import esDashboard from "@/messages/es/dashboard.json";
import esExpenses from "@/messages/es/expenses.json";
import esIncome from "@/messages/es/income.json";
import esMoney from "@/messages/es/money.json";
import esMovements from "@/messages/es/movements.json";
import esNav from "@/messages/es/nav.json";
import esSettings from "@/messages/es/settings.json";
import esSettlement from "@/messages/es/settlement.json";

const en = {
    auth: enAuth,
    categories: enCategories,
    category: enCategory,
    common: enCommon,
    dashboard: enDashboard,
    expenses: enExpenses,
    income: enIncome,
    money: enMoney,
    movements: enMovements,
    nav: enNav,
    settings: enSettings,
    settlement: enSettlement,
};

/** English is the reference shape; the Spanish tree must match it to compile. */
export type Messages = typeof en;

export const MESSAGES: Record<Locale, Messages> = {
    en,
    es: {
        auth: esAuth,
        categories: esCategories,
        category: esCategory,
        common: esCommon,
        dashboard: esDashboard,
        expenses: esExpenses,
        income: esIncome,
        money: esMoney,
        movements: esMovements,
        nav: esNav,
        settings: esSettings,
        settlement: esSettlement,
    },
};
