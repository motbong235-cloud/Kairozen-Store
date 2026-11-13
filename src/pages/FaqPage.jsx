export default function FaqPage() {
  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div className="page-hero">
          <h1>FAQ</h1>
          <p>Common questions about Kairozen Store</p>
        </div>
        <div className="faq">
          <details open>
            <summary>How fast is delivery?</summary>
            <p>Most orders complete within seconds after KHQR payment is confirmed.</p>
          </details>
          <details>
            <summary>Which payments do you accept?</summary>
            <p>ABA PayWay / KHQR via RielPay.</p>
          </details>
          <details>
            <summary>What if my order fails?</summary>
            <p>Use Track page with Order ID, or contact Telegram support.</p>
          </details>
          <details>
            <summary>Is my account safe?</summary>
            <p>We only need game ID / username — never your password.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
