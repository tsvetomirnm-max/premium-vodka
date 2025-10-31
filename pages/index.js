export default function Home() {
  return (
    <div
      style={{
        fontFamily:
          "'Helvetica Neue', Helvetica, Arial, sans-serif",
        background: "#ffffff",
        color: "#000000",
        textAlign: "center",
        minHeight: "100vh",
        padding: "4rem 1rem",
      }}
    >
      <h1
        style={{
          fontSize: "4rem",
          fontWeight: "900",
          letterSpacing: "1px",
          marginBottom: "3rem",
        }}
      >
        TRUE VODKA
      </h1>

      <textarea
        id="prompt"
        placeholder="Type your question here..."
        style={{
          width: "90%",
          maxWidth: "700px",
          height: "140px",
          fontSize: "1rem",
          padding: "1rem",
          border: "2px solid #000",
          borderRadius: "0", // sharp edges
          outline: "none",
          resize: "vertical",
          color: "#000",
          background: "#fff",
        }}
      ></textarea>
      <br />
      <button
        onClick={() => ask()}
        style={{
          marginTop: "1.5rem",
          padding: "0.8rem 2rem",
          fontSize: "1.1rem",
          fontWeight: "600",
          border: "2px solid #000",
          borderRadius: "0", // sharp
          background: "#fff",
          color: "#000",
          cursor: "pointer",
        }}
      >
        Ask
      </button>

      <pre
        id="output"
        style={{
          marginTop: "2.5rem",
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          background: "#fff",
          color: "#000",
          border: "2px solid #000",
          borderRadius: "0", // sharp
          padding: "1rem",
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
