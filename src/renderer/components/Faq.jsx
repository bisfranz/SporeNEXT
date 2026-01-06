import React, { useState } from "react";
import "../styles/faq.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { useLocale } from "../hooks/useLocale";

const FAQ_IDS = [
  "faq-1",
  "faq-2",
  "faq-3",
  "faq-4",
  "faq-5",
  "faq-6",
  "faq-7",
  "faq-8",
  "faq-9",
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(null);
  const { t } = useLocale();

  const toggle = (idx) => setOpenIndex(openIndex === idx ? null : idx);

  const renderItem = (id, idx) => (
    <div
      key={id}
      className={`faq-accordion-item${openIndex === idx ? " open" : ""}`}
    >
      <button
        className="faq-accordion-question"
        onClick={() => toggle(idx)}
        aria-expanded={openIndex === idx}
      >
        <span>{t(`${id}.question`)}</span>
        <span className="faq-accordion-arrow">
          {openIndex === idx ? "▼" : "▶"}
        </span>
      </button>
      <div
        className="faq-accordion-answer"
        style={{
          maxHeight: openIndex === idx ? "300px" : "0",
          opacity: openIndex === idx ? 1 : 0,
          pointerEvents: openIndex === idx ? "auto" : "none",
        }}
      >
        <span dangerouslySetInnerHTML={{ __html: t(`${id}.answer`) }} />
      </div>
    </div>
  );

  const leftIds = FAQ_IDS.slice(0, 5);
  const rightIds = FAQ_IDS.slice(5);

  return (
    <div className="faq-root">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "0.2rem",
        }}
      >
        <FontAwesomeIcon
          icon={faCircleQuestion}
          style={{ color: "#7e5ab8", fontSize: "1.5rem" }}
        />
        <h2 className="faq-title">{t("faq-title")}</h2>
      </div>

      <div className="faq-grid">
        <div className="faq-column">
          {leftIds.map((id) => renderItem(id, FAQ_IDS.indexOf(id)))}
        </div>
        <div className="faq-column">
          {rightIds.map((id) => renderItem(id, FAQ_IDS.indexOf(id)))}
        </div>
      </div>
    </div>
  );
}
