// lib/ui.ts
import type React from "react";

export const UI = {
    fontSize: {
        body: 14,
        primary: 14,
        pill: 12,
        small: 11,
    },
    fontWeight: {
        normal: 600,
        strong: 800,
        bold: 900,
    },
    pill: {
        paddingY: 6,
        paddingX: 10,
        radius: 999,
        border: "1px solid #ddd",
    },
    card: {
        radius: 12,
        border: "1px solid #ddd",
        padding: 10,
    },
} as const;

export function pillBase(extra?: React.CSSProperties): React.CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        padding: `${UI.pill.paddingY}px ${UI.pill.paddingX}px`,
        borderRadius: UI.pill.radius,
        border: UI.pill.border,
        fontSize: UI.fontSize.pill,
        lineHeight: "16px",
        fontWeight: UI.fontWeight.bold,
        whiteSpace: "nowrap",
        ...extra,
    };
}

export function cardBase(extra?: React.CSSProperties): React.CSSProperties {
    return {
        padding: UI.card.padding,
        border: UI.card.border,
        borderRadius: UI.card.radius,
        ...extra,
    };
}
