export default function Home() {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#0b0b0b",
        color: "#f5f5f5",
        textAlign: "center",
        minHeight: "100vh",
        padding: "3rem 1rem",
      }}
    >
      <h1 style={{ fontSize: "3rem", letterSpacing: "2px" }}>PREMIUM VODKA</h1>
      <textarea
        id="prompt"
        placeholder="Type your question here..."
        style={{
          width: "90%",
          maxWidth: "700px",
          height: "120px",
          fontSize: "1rem",
          padding: "1rem",
          borderRadius: "12px",
          border: "none",
          outline: "none",
          resize: "vertical",
        }}
      ></textarea>
      <br />
      <button
        onClick={() => ask()}
        style={{
          marginTop: "1rem",
          padding: "0.8rem 2rem",
          fontSize: "1.1rem",
          border: "none",
          borderRadius: "8px",
          background: "#e0e0e0",
          cursor: "pointer",
        }}
      >
        Ask
      </button>
      <pre
        id="output"
        style={{
          marginTop: "2rem",
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          background: "#1e1e1e",
          padding: "1rem",
          borderRadius: "10px",
          width: "90%",
          maxWidth: "700px",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      ></pre>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            async function ask() {
              const prompt = document.getElementById("prompt").value.trim();
              const output = document.getElementById("output");
              if (!prompt) { output.textContent = "Please enter a question."; return; }
              output.textContent = "Thinking...";
              try {
                const r = await fetch("/api/distill?prompt=" + encodeURIComponent(prompt));
                const data = await r.json();
                output.textContent = JSON.stringify(data, null, 2);
              } catch (err) {
                output.textContent = "Error: " + err;
              }
            }
          `,
        }}
      />
    </div>
  );
}
