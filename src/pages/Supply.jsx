import { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { DemandHeader, OfferSheet, SentNotice, Shell, Message, useRemote } from "./Trial.jsx";

// Personal link of a registered fish owner: the same sheet, with nothing to
// type about himself. It always shows the current active demand.
export default function Supply({ token }) {
  const [state, reload] = useRemote("/api/supply/" + token);
  const [sent, setSent] = useState(false);
  useEffect(() => { document.title = "حصاد جازان | المتوفر عندك"; }, []);
  const s = state.data;

  return (
    <Shell>
      {state.status === "loading" && <p style={css("margin:0;color:#546965")}>لحظة…</p>}
      {state.status === "missing" && <Message title="هذا الرابط غير متاح">تواصل مع حصاد جازان للحصول على رابطك الجديد.</Message>}
      {state.status === "error" && <Message alert>تعذّر التحميل الآن. حاول مرة ثانية بعد قليل.</Message>}
      {s && !s.demand && <Message title={"حياك الله " + s.name}>لا يوجد احتياج مفتوح الآن. افتح هذا الرابط نفسه لما نرسل لك أن الاحتياج جاهز.</Message>}
      {s && s.demand && (
        <>
          <DemandHeader d={s.demand} greeting={"حياك الله " + s.name} />
          {sent && <SentNotice />}
          <OfferSheet url={"/api/supply/" + token + "/offers"} items={s.demand.items} mine={s.mine} onSent={() => { setSent(true); reload(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </>
      )}
    </Shell>
  );
}
