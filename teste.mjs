import {
  obterEstadoPaciente,
  atualizarEstadoPaciente,
  obterSessao,
  obterEstadoExercicio
} from "./flor-agent.mjs";

async function main() {
  console.log("\n=== TESTE DE REGRESSÃO FLOR T. ===\n");

  let passou = true;

  // 1. Isolamento
  const pacienteA = `reg-A-${Date.now()}`;
  const pacienteB = `reg-B-${Date.now()}`;

  const estadoA = obterEstadoPaciente(pacienteA);
  const estadoB = obterEstadoPaciente(pacienteB);

  estadoA.objetivoAtual = "Parar de fumar";
  estadoB.objetivoAtual = "Reduzir o cigarro";

  if (estadoA.objetivoAtual === estadoB.objetivoAtual) {
    console.log("❌ Isolamento");
    passou = false;
  } else {
    console.log("✅ Isolamento");
  }

  // 2. Persistência
  const pacienteP = `reg-persistencia-${Date.now()}`;

  atualizarEstadoPaciente(pacienteP, {
    objetivoAtual: "Parar de fumar",
    nivelMotivacao: 8
  });

  const estadoP = obterEstadoPaciente(pacienteP);

  if (
    estadoP.objetivoAtual === "Parar de fumar" &&
    estadoP.nivelMotivacao === 8
  ) {
    console.log("✅ Persistência");
  } else {
    console.log("❌ Persistência");
    passou = false;
  }

  // 3. Sessão
  const pacienteS = `reg-sessao-${Date.now()}`;

  const sessao1 = await obterSessao(pacienteS);
  const id1 = await sessao1.getSessionId();

  const sessao2 = await obterSessao(pacienteS);
  const id2 = await sessao2.getSessionId();

  if (id1 === id2) {
    console.log("✅ Reutilização da sessão");
  } else {
    console.log("❌ Reutilização da sessão");
    passou = false;
  }

  // 4. Estrutura do estado de exercício
  const pacienteE = `reg-exercicio-${Date.now()}`;
  const estadoE = obterEstadoExercicio(pacienteE);

  if (
    estadoE.ativo === false &&
    estadoE.exercicioId === null &&
    estadoE.etapaAtual === 0
  ) {
    console.log("✅ Estado inicial do exercício");
  } else {
    console.log("❌ Estado inicial do exercício");
    passou = false;
  }

  console.log(
    passou
      ? "\n🎉 RESULTADO: TODOS OS TESTES PASSARAM"
      : "\n❌ RESULTADO: HÁ TESTES COM FALHA"
  );

  if (!passou) process.exitCode = 1;
}

main();
