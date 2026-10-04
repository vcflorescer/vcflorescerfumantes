import crypto from "node:crypto";
import express from "express";
import { run } from "@openai/agents";
import {
  agente,
  obterSessao,
} from "./flor-agent.mjs";

const app = express();

app.use(express.json());
app.use(express.static("frontend/dist"));

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas de login. Tente novamente mais tarde."
  }
});

const limiteMensagens = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas mensagens em pouco tempo. Aguarde um momento."
  }
});

const sessoesAutenticadas = new Map();
const DURACAO_TOKEN_MS = 1000 * 60 * 60 * 8;

function criarToken(patientId) {
  const token = crypto.randomBytes(32).toString("hex");

  sessoesAutenticadas.set(token, {
    patientId,
    expiraEm: Date.now() + DURACAO_TOKEN_MS,
  });

  return token;
}

function validarToken(req) {
  const cabecalho = req.headers.authorization || "";

  if (!cabecalho.startsWith("Bearer ")) {
    return null;
  }

  const token = cabecalho.slice(7);
  const sessao = sessoesAutenticadas.get(token);

  if (!sessao) {
    return null;
  }

  if (Date.now() > sessao.expiraEm) {
    sessoesAutenticadas.delete(token);
    return null;
  }

  return sessao;
}

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

app.post("/api/login", limiteLogin, async (req, res) => {
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

    const token = criarToken(patientId);

    res.json({
      autenticado: true,
      patientId,
      token,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao autenticar." });
  }
});

app.post("/api/mensagem", limiteMensagens, async (req, res) => {
  try {
    const sessaoAutenticada = validarToken(req);

    if (!sessaoAutenticada) {
      return res.status(401).json({
        erro: "Sessão inválida ou expirada."
      });
    }

    const { patientId, mensagem } = req.body;

    if (!patientId || !mensagem) {
      return res.status(400).json({
        erro: "patientId e mensagem são obrigatórios."
      });
    }

    if (patientId !== sessaoAutenticada.patientId) {
      return res.status(403).json({
        erro: "Paciente não autorizado."
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
