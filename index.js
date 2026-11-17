const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.redirect("/index.html");
});

app.post("/api/chat", async (req, res) => {
    try {
        let messages = req.body.messages || req.body.message;

        if (typeof messages === "string") {
            messages = [{ role: "user", content: messages }];
        }

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).send("Messages harus berupa String atau Array");
        }

        // Fungsi fetch ke OpenRouter dengan Auto-Retry jika terkena Rate Limit (429)
        const fetchOpenRouter = async (retries = 2) => {
            for (let i = 0; i <= retries; i++) {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "HTTP-Referer": "http://localhost:3000",
                        "X-Title": "Chatbot AI"
                    },
                    body: JSON.stringify({
                        model: "inclusionai/ling-3.2-flash:free", // Sesuai instruksi praktikum
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 1000,
                        stream: true
                    })
                });

                if (response.ok) return response;

                // Jika rate limit (429) dan masih ada sisa retry, tunggu 2 detik lalu coba lagi
                if (response.status === 429 && i < retries) {
                    console.log(`[OpenRouter 429] Antrean padat, mencoba ulang otomatis (${i + 1}/${retries})...`);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    continue;
                }

                return response;
            }
        };

        const response = await fetchOpenRouter();

        // Mengatur Header SSE Streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Jika respons tetap gagal setelah percobaan ulang
        if (!response.ok) {
            const errorJson = await response.json().catch(() => ({}));
            console.error("OpenRouter Error Detail:", errorJson);

            let msg = "Model Ling 3.2 Flash sedang dipadati antrean server (Rate Limit 429). Silakan tunggu 3–5 detik lalu kirim ulang.";
            if (response.status !== 429) {
                msg = `Terjadi kesalahan pada server AI (${response.status}).`;
            }

            res.write(`data: ${JSON.stringify(msg)}\n\n`);
            res.write("data: [DONE]\n\n");
            return res.end();
        }

        // Membaca Data Stream dari OpenRouter
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

                const data = trimmedLine.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        res.write(`data: ${JSON.stringify(content)}\n\n`);
                    }
                } catch (error) {
                    // Abaikan potongan chunk yang belum lengkap
                }
            }
        }
        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("Server Error:", error);
        if (!res.headerSent) {
            res.status(500).send("Terjadi kesalahan koneksi pada server.");
        } else {
            res.write(`data: ${JSON.stringify("Terjadi kesalahan pada server")}\n\n`);
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

module.exports = app;