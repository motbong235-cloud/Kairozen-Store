export default function FaqPage() {
  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 720 }}>
        <div className="faq-box">
          <h2>
            Frequently Asked
            <br />
            Questions (FAQs)
          </h2>
          <p className="sub">Common questions about Kairozen Store top-up.</p>
          <div className="faq-list">
            <details className="fi" open>
              <summary>How fast is delivery?</summary>
              <p>Most orders complete within seconds after KHQR payment is confirmed.</p>
            </details>
            <details className="fi">
              <summary>Which payments do you accept?</summary>
              <p>ABA PayWay / KHQR via RielPay and major Cambodian channels.</p>
            </details>
            <details className="fi">
              <summary>What if my order fails?</summary>
              <p>Use Track with Order ID, or contact Telegram support for refund / re-deliver.</p>
            </details>
            <details className="fi">
              <summary>Is my account safe?</summary>
              <p>We only need game ID / username — never your password.</p>
            </details>
          </div>
        </div>
        <div className="support">
          <h3>Tell your problem, Don&apos;t Keep it to yourself!</h3>
          <a
            className="btn btn-p"
            href="https://t.me/kairozen_support"
            target="_blank"
            rel="noreferrer"
          >
            Contact support
          </a>
        </div>
      </div>
    </section>
  );
}
