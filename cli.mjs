import {
  agente,
  obterSessao,
  obterEstadoPaciente,
  obterEstadoExercicio,
} from "./flor-agent.mjs";

import { run } from "@openai/agents";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function perguntar(pergunta) {
  return new Promise((resolve) => {
    rl.question(pergunta, resolve);
  });
}

let patientId = await perguntar(
  "\nDigite o ID do paciente de teste: "
);

patientId = patientId.trim();

let session = await obterSessao(patientId);

const estadoInicial = obterEstadoExercicio(patientId);
const estadoPacienteInicial = obterEstadoPaciente(patientId);

let mensagem;

if (
  estadoInicial.ativo &&
  estadoInicial.exercicioId
) {
  mensagem =
    "Tenho um exercício em andamento. Retome o exercício pendente exatamente na etapa atual.";
} else if (
  estadoPacienteInicial.objetivoAtual ||
  estadoPacienteInicial.gatilhos.length > 0 ||
  estadoPacienteInicial.estrategiasQueFuncionaram.length > 0 ||
  estadoPacienteInicial.exerciciosRealizados.length > 0
) {
  mensagem =
    "Existe um estado anterior deste paciente. Consulte o estado do paciente antes de conduzir a conversa e use-o apenas para dar continuidade ao acompanhamento. Depois cumprimente o paciente e faça uma pergunta por vez.";
} else {
  mensagem = await perguntar(
    "\nFlor T.: Olá! O que você precisa neste momento?\n\nVocê: "
  );
}

while (mensagem.trim().toLowerCase() !== "sair") {
  if (
    mensagem.trim().toLowerCase() ===
    "/trocar-paciente"
  ) {
    const novoPatientId = await perguntar(
      "\nDigite o novo ID do paciente: "
    );

    patientId = novoPatientId.trim();

    session = await obterSessao(patientId);

    console.log(
      `\n[SESSÃO] Paciente atual: ${patientId}`
    );

    const estadoPaciente =
      obterEstadoPaciente(patientId);

    const estadoExercicio =
      obterEstadoExercicio(patientId);

    if (
      estadoExercicio.ativo &&
      estadoExercicio.exercicioId
    ) {
      mensagem =
        "Tenho um exercício em andamento. Retome o exercício pendente exatamente na etapa atual.";
    } else if (
      estadoPaciente.objetivoAtual ||
      estadoPaciente.gatilhos.length > 0 ||
      estadoPaciente.estrategiasQueFuncionaram.length > 0 ||
      estadoPaciente.exerciciosRealizados.length > 0
    ) {
      mensagem =
        "Existe um estado anterior deste paciente. Consulte o estado do paciente antes de conduzir a conversa e use-o apenas para dar continuidade ao acompanhamento. Depois cumprimente o paciente e faça uma pergunta por vez.";
    } else {
      mensagem = await perguntar(
        "\nFlor T.: O que você precisa neste momento?\n\nVocê: "
      );
    }

    continue;
  }

  try {
    const resultado = await run(
      agente,
      mensagem,
      { session }
    );

    console.log(
      "\nFlor T.:",
      resultado.finalOutput
    );
  } catch (erro) {
    console.log(
      "\nErro:",
      erro.message
    );
  }

  mensagem = await perguntar("\nVocê: ");
}

console.log(
  "\nFlor T.: Até a próxima. 🌱"
);

rl.close();
