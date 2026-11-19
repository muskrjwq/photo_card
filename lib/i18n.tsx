"use client";

import { createContext, useContext, type ReactNode } from "react";

export type Locale = "ko" | "en";

const LocaleContext = createContext<Locale>("ko");

const memberNames: Record<string, string> = {
  원이: "Woni", 리브: "Liv", 미나미: "Minami", 메이: "May", 제나: "Zena", 단체: "Group", 유닛: "Unit",
};

const collectionNames: Record<string, string> = {
  팬클럽: "Fan Club", 응원봉: "Light Stick", 팬콘: "Fan Concert", "KCON-Japan": "KCON Japan",
  카사베르디: "Casa Verdi", 나랑드: "Narangd", 도미노스: "Domino's", 한스킨: "Hanskin", 에이페: "Epais",
  할리스커피: "Hollys Coffee", "CU리센느빵 시즌1": "CU RESCENE Bread Season 1", "CU리센느빵 시즌2": "CU RESCENE Bread Season 2",
  와키윌리: "Wacky Willy", "CU 덕연이 딸 도시락": "CU Deokyeon Lunchbox", 기타: "Miscellaneous",
  "더현대 팝업": "The Hyundai Pop-up", "성수 팝업": "Seongsu Pop-up", 그레인온: "Grain On",
  "Blip x Lush 슈퍼팬파티": "Blip x Lush Superfan Party", 레미니: "Lemini",
};

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (ko: string, en: string) => locale === "en" ? en : ko,
    memberLabel: (name: string) => locale === "en" ? memberNames[name] ?? name : name,
    collectionLabel: (name: string) => locale === "en" ? collectionNames[name] ?? name : name,
  };
}

export function tr(locale: Locale, ko: string, en: string) { return locale === "en" ? en : ko; }
