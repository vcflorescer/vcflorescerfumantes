import express from "express";
import { run } from "@openai/agents";
import {
  agente,
  obterSessao,
} from "./flor-agent.mjs";

const app = express();

app.use(express.json());
app.use(express.static("frontend/dist"));

function autenticar(req, res, next) {
  const chave = req.headers["x-api-key"];

  if (!process.env.FLOR_API_KEY || chave !== process.env.FLOR_API_KEY) {
    return res.status(401).json({
      erro: "Não autorizado."
    });
  }

  next();
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    servico: "Flor T."
  });
});

app.post("/api/login", async (req, res) => {
  try {
    const { patientId, segredo } = req.body;

    if (!patientId || !segredo) {
      return res.status(400).json({ erro: "Código e segredo são obrigatórios." });
    }

    const hashEsperado = process.env[`FLOR_PATIENT_${patientId}_HASH`];

    if (!hashEsperado) {
      return res.status(401).json({ erro: "Código ou segredo inválido." });
    }

    const crypto = await import("node:crypto");
    const hashRecebido = crypto.createHash("sha256").update(segredo).digest("hex");

    if (
      hashRecebido.length !== hashEsperado.length ||
      !crypto.timingSafeEqual(
        Buffer.from(hashRecebido),
        Buffer.from(hashEsperado)
      )
    ) {
      return res.status(401).json({ erro: "Código ou segredo inválido." });
    }

    res.json({ autenticado: true, patientId });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao autenticar." });
  }
});

app.post("/api/mensagem", async (req, res) => {
  try {
    const { patientId, mensagem } = req.body;

    if (!patientId || !mensagem) {
      return res.status(400).json({
        erro: "patientId e mensagem são obrigatórios."
      });
    }

    const session = await obterSessao(patientId);

    const resultado = await run(
      agente,
      mensagem,
      { session }
    );

    res.json({
      patientId,
      resposta: resultado.finalOutput
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({
      erro: "Erro ao processar mensagem."
    });
  }
});

app.post("/mensagem", autenticar, async (req, res) => {
  try {
    const { patientId, mensagem } = req.body;

    if (!patientId || !mensagem) {
      return res.status(400).json({
        erro: "patientId e mensagem são obrigatórios."
      });
    }

    const session = await obterSessao(patientId);

    const resultado = await run(
      agente,
      mensagem,
      { session }
    );

    res.json({
      patientId,
      resposta: resultado.finalOutput
    });

  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro ao processar mensagem."
    });
  }
});

const PORTA = process.env.PORT || 3000;

app.listen(PORTA, "0.0.0.0", () => {
  console.log(`Flor T. API rodando em http://localhost:${PORTA}`);
});
