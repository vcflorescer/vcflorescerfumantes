import {
  Agent,
  OpenAIConversationsSession,
  run,
  tool,
} from "@openai/agents";

import readline from "readline";
import fs from "fs";

import { exercicios } from "./exercicios.mjs";
import { z } from "zod";


// ============================================================
// PERSISTÊNCIA
// ============================================================

const ARQUIVO_SESSOES = "./dados_sessoes.json";

function carregarDados() {
  if (!fs.existsSync(ARQUIVO_SESSOES)) {
    return {};
  }

  const conteudo = fs.readFileSync(
    ARQUIVO_SESSOES,
    "utf-8"
  );

  if (!conteudo.trim()) {
    return {};
  }

  try {
    return JSON.parse(conteudo);
  } catch {
    return {};
  }
}

function salvarDados(dados) {
  fs.writeFileSync(
    ARQUIVO_SESSOES,
    JSON.stringify(dados, null, 2),
    "utf-8"
  );
}

const dadosPersistidos = carregarDados();


// ============================================================
// ESTADO ESTRUTURADO DO PACIENTE
// ============================================================

const estadosPacientePersistidos =
  dadosPersistidos.estadosPaciente || {};

function obterEstadoPaciente(patientId) {
  if (!estadosPacientePersistidos[patientId]) {
    estadosPacientePersistidos[patientId] = {
      objetivoAtual: null,
      nivelMotivacao: null,
      intensidadeFissura: null,
      gatilhos: [],
      estrategiasQueFuncionaram: [],
      exerciciosRealizados: [],
      dificuldadesRecorrentes: [],
      observacoes: [],
      atualizadoEm: null,
    };

    salvarDados({
      ...dadosPersistidos,
      estadosPaciente: estadosPacientePersistidos,
    });
  }

  return estadosPacientePersistidos[patientId];
}

function atualizarEstadoPaciente(
  patientId,
  alteracoes
) {
  const estado = obterEstadoPaciente(patientId);

  Object.assign(estado, alteracoes);

  estado.atualizadoEm =
    new Date().toISOString();

  salvarDados({
    ...dadosPersistidos,
    estadosPaciente: estadosPacientePersistidos,
  });

  return estado;
}


// ============================================================
// ESTADO DOS EXERCÍCIOS
// ============================================================

const estadosExercicio = new Map();

const dadosExerciciosPersistidos =
  dadosPersistidos.exercicios || {};

function obterEstadoExercicio(patientId) {
  if (!estadosExercicio.has(patientId)) {
    const estadoSalvo =
      dadosExerciciosPersistidos[patientId];

    estadosExercicio.set(
      patientId,
      estadoSalvo || {
        ativo: false,
        pausado: false,
        exercicioId: null,
        etapaAtual: 0,
        respostas: [],
      }
    );
  }

  return estadosExercicio.get(patientId);
}


// ============================================================
// FERRAMENTA: CONSULTAR EXERCÍCIO
// ============================================================

const consultarExercicio = tool({
  name: "consultar_exercicio",

  description:
    "Consulta um exercício específico da biblioteca de exercícios.",

  parameters: z.object({
    id: z
      .string()
      .describe("ID do exercício, por exemplo EX-020"),
  }),

  execute: async ({ id }) => {
    const exercicio =
      exercicios.find(
        (item) =>
          item.id.toLowerCase() ===
          id.toLowerCase()
      );

    if (!exercicio) {
      return JSON.stringify({
        sucesso: false,
        mensagem: `Exercício ${id} não encontrado.`,
      });
    }

    return JSON.stringify({
      sucesso: true,
      exercicio,
    });
  },
});


// ============================================================
// FERRAMENTA: BUSCAR EXERCÍCIOS
// ============================================================

const buscarExercicios = tool({
  name: "buscar_exercicios",

  description:
    "Busca os exercícios mais adequados ao contexto informado pelo paciente.",

  parameters: z.object({
    contexto: z
      .string()
      .describe(
        "Contexto, objetivo ou dificuldade relatada pelo paciente."
      ),

    intensidade: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe(
        "Intensidade relatada pelo paciente, se houver."
      ),
  }),

  execute: async ({
    contexto,
    intensidade,
  }) => {
    const texto =
      contexto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const resultados =
      exercicios
        .map((exercicio) => {
          const textoExercicio = `
            ${exercicio.nome}
            ${exercicio.objetivo}
            ${exercicio.quando_usar}
            ${exercicio.intensidade}
          `
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

          const palavras =
            texto
              .split(/\s+/)
              .filter(
                (palavra) =>
                  palavra.length > 3
              );

          let pontuacao = 0;

          for (const palavra of palavras) {
            if (
              textoExercicio.includes(
                palavra
              )
            ) {
              pontuacao += 1;
            }
          }

          if (
            intensidade !== undefined
          ) {
            const intensidadeTexto =
              String(
                exercicio.intensidade
              );

            if (
              intensidadeTexto.includes(
                String(intensidade)
              )
            ) {
              pontuacao += 3;
            }
          }

          return {
            exercicio,
            pontuacao,
          };
        })
        .sort(
          (a, b) =>
            b.pontuacao -
            a.pontuacao
        )
        .slice(0, 5);

    return JSON.stringify({
      sucesso: true,
      resultados,
    });
  },
});


// ============================================================
// FERRAMENTA: INICIAR EXERCÍCIO
// ============================================================

const iniciarExercicio = tool({
  name: "iniciar_exercicio",

  description:
    "Inicia um exercício para o paciente atual.",

  parameters: z.object({
    id: z
      .string()
      .describe(
        "ID do exercício, por exemplo EX-020"
      ),

    patientId: z
      .string()
      .describe(
        "ID do paciente da sessão atual."
      ),
  }),

  execute: async ({
    id,
    patientId,
  }) => {
    const estadoExercicio =
      obterEstadoExercicio(
        patientId
      );

    const exercicio =
      exercicios.find(
        (item) =>
          item.id.toLowerCase() ===
          id.toLowerCase()
      );

    if (!exercicio) {
      return JSON.stringify({
        sucesso: false,
        mensagem: `Exercício ${id} não encontrado.`,
      });
    }

    estadoExercicio.ativo = true;
    estadoExercicio.pausado = false;
    estadoExercicio.exercicioId =
      exercicio.id;
    estadoExercicio.etapaAtual = 1;
    estadoExercicio.respostas = [];

    dadosExerciciosPersistidos[
      patientId
    ] = {
      ...estadoExercicio,
    };

    salvarDados({
      ...dadosPersistidos,
      exercicios:
        dadosExerciciosPersistidos,
    });

    return JSON.stringify({
      sucesso: true,
      exercicioId:
        exercicio.id,
      nome:
        exercicio.nome,
      etapaAtual:
        estadoExercicio.etapaAtual,
      totalEtapas:
        exercicio.etapas.length,
      primeiraPergunta:
        exercicio.etapas[0],
    });
  },
});


// ============================================================
// FERRAMENTA: RESPONDER EXERCÍCIO
// ============================================================

const responderExercicio = tool({
  name: "responder_exercicio",

  description:
    "Registra a resposta do paciente à etapa atual do exercício e avança somente quando houver resposta válida.",

  parameters: z.object({
    resposta: z
      .string()
      .describe(
        "Resposta do paciente à etapa atual."
      ),

    patientId: z
      .string()
      .describe(
        "ID do paciente da sessão atual."
      ),
  }),

  execute: async ({
    resposta,
    patientId,
  }) => {
    const estado =
      obterEstadoExercicio(
        patientId
      );

    if (
      !estado.ativo ||
      !estado.exercicioId
    ) {
      return JSON.stringify({
        sucesso: false,
        mensagem:
          "Não há exercício ativo para este paciente.",
      });
    }

    const exercicio =
      exercicios.find(
        (item) =>
          item.id ===
          estado.exercicioId
      );

    if (!exercicio) {
      return JSON.stringify({
        sucesso: false,
        mensagem:
          "Exercício ativo não encontrado.",
      });
    }

    const respostaNormalizada =
      resposta
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        );

    const respostasInsuficientes = [
      "nao sei",
      "nao consigo",
      "nao entendi",
      "nao sei responder",
    ];

    const respostaInsuficiente =
      respostasInsuficientes.some(
        (item) =>
          respostaNormalizada.includes(
            item
          )
      );

    if (respostaInsuficiente) {
      return JSON.stringify({
        sucesso: true,
        manterEtapa: true,
        etapaAtual:
          estado.etapaAtual,
        pergunta:
          exercicio.etapas[
            estado.etapaAtual - 1
          ],
      });
    }

    estado.respostas.push({
      etapa:
        estado.etapaAtual,
      resposta,
    });

    if (
      estado.etapaAtual >=
      exercicio.etapas.length
    ) {
      estado.ativo = false;
      estado.pausado = false;

      dadosExerciciosPersistidos[
        patientId
      ] = {
        ...estado,
      };

      const estadoPaciente =
        obterEstadoPaciente(
          patientId
        );

      if (
        !estadoPaciente.exerciciosRealizados.includes(
          exercicio.id
        )
      ) {
        estadoPaciente.exerciciosRealizados.push(
          exercicio.id
        );
      }

      atualizarEstadoPaciente(
        patientId,
        {}
      );

      salvarDados({
        ...dadosPersistidos,
        exercicios:
          dadosExerciciosPersistidos,
        estadosPaciente:
          estadosPacientePersistidos,
      });

      return JSON.stringify({
        sucesso: true,
        concluido: true,
        exercicioId:
          exercicio.id,
        nome:
          exercicio.nome,
      });
    }

    estado.etapaAtual += 1;

    dadosExerciciosPersistidos[
      patientId
    ] = {
      ...estado,
    };

    salvarDados({
      ...dadosPersistidos,
      exercicios:
        dadosExerciciosPersistidos,
    });

    return JSON.stringify({
      sucesso: true,
      concluido: false,
      etapaAtual:
        estado.etapaAtual,
      totalEtapas:
        exercicio.etapas.length,
      proximaEtapa:
        estado.etapaAtual,
      proximaPergunta:
        exercicio.etapas[
          estado.etapaAtual - 1
        ],
    });
  },
});


// ============================================================
// FERRAMENTA: CONSULTAR ESTADO DO PACIENTE
// ============================================================

const consultarEstadoPaciente = tool({
  name: "consultar_estado_paciente",

  description:
    "Consulta o estado comportamental registrado do paciente atual. Use para recuperar objetivo, motivação, fissura, gatilhos, estratégias e dificuldades já registradas.",

  parameters: z.object({
    patientId: z
      .string()
      .describe(
        "ID do paciente da sessão atual."
      ),
  }),

  execute: async ({
    patientId,
  }) => {
    const estado =
      obterEstadoPaciente(
        patientId
      );

    return JSON.stringify({
      sucesso: true,
      patientId,
      estado,
    });
  },
});


// ============================================================
// FERRAMENTA: ATUALIZAR ESTADO DO PACIENTE
// ============================================================

const atualizarEstadoPacienteTool =
  tool({
    name:
      "atualizar_estado_paciente",

    description:
      "Registra informações explicitamente fornecidas pelo paciente no estado comportamental da sessão. Nunca invente ou infira informações.",

    parameters: z.object({
      patientId: z
        .string()
        .describe(
          "ID do paciente da sessão atual."
        ),

      objetivoAtual: z
        .string()
        .nullable()
        .optional(),

      nivelMotivacao: z
        .number()
        .min(0)
        .max(10)
        .nullable()
        .optional(),

      intensidadeFissura: z
        .number()
        .min(0)
        .max(10)
        .nullable()
        .optional(),

      gatilho: z
        .string()
        .nullable()
        .optional(),

      estrategiaQueFuncionou: z
        .string()
        .nullable()
        .optional(),

      dificuldadeRecorrente: z
        .string()
        .nullable()
        .optional(),

      observacao: z
        .string()
        .nullable()
        .optional(),
    }),

    execute: async ({
      patientId,
      objetivoAtual,
      nivelMotivacao,
      intensidadeFissura,
      gatilho,
      estrategiaQueFuncionou,
      dificuldadeRecorrente,
      observacao,
    }) => {
      const alteracoes = {};

      if (
        objetivoAtual !==
          undefined &&
        objetivoAtual !== null
      ) {
        alteracoes.objetivoAtual =
          objetivoAtual;
      }

      if (
        nivelMotivacao !==
          undefined &&
        nivelMotivacao !== null
      ) {
        alteracoes.nivelMotivacao =
          nivelMotivacao;
      }

      if (
        intensidadeFissura !==
          undefined &&
        intensidadeFissura !== null
      ) {
        alteracoes.intensidadeFissura =
          intensidadeFissura;
      }

      if (gatilho) {
        const estado =
          obterEstadoPaciente(
            patientId
          );

        if (
          !estado.gatilhos.includes(
            gatilho
          )
        ) {
          estado.gatilhos.push(
            gatilho
          );
        }
      }

      if (
        estrategiaQueFuncionou
      ) {
        const estado =
          obterEstadoPaciente(
            patientId
          );

        if (
          !estado.estrategiasQueFuncionaram.includes(
            estrategiaQueFuncionou
          )
        ) {
          estado.estrategiasQueFuncionaram.push(
            estrategiaQueFuncionou
          );
        }
      }

      if (
        dificuldadeRecorrente
      ) {
        const estado =
          obterEstadoPaciente(
            patientId
          );

        if (
          !estado.dificuldadesRecorrentes.includes(
            dificuldadeRecorrente
          )
        ) {
          estado.dificuldadesRecorrentes.push(
            dificuldadeRecorrente
          );
        }
      }

      if (observacao) {
        const estado =
          obterEstadoPaciente(
            patientId
          );

        estado.observacoes.push({
          texto: observacao,
          registradoEm:
            new Date().toISOString(),
        });
      }

      if (
        Object.keys(
          alteracoes
        ).length > 0
      ) {
        atualizarEstadoPaciente(
          patientId,
          alteracoes
        );
      } else {
        salvarDados({
          ...dadosPersistidos,
          estadosPaciente:
            estadosPacientePersistidos,
        });
      }

      return JSON.stringify({
        sucesso: true,
        estado:
          obterEstadoPaciente(
            patientId
          ),
      });
    },
  });


// ============================================================
// FERRAMENTA: GERAR RESUMO
// ============================================================

const gerarResumoPaciente =
  tool({
    name:
      "gerar_resumo_paciente",

    description:
      "Gera um resumo estruturado do estado atual do paciente para facilitar a continuidade entre sessões. Use somente informações já registradas no estado do paciente. Não faça diagnósticos ou inferências clínicas.",

    parameters: z.object({
      patientId: z
        .string()
        .describe(
          "ID do paciente da sessão atual."
        ),
    }),

    execute: async ({
      patientId,
    }) => {
      const estado =
        obterEstadoPaciente(
          patientId
        );

      const resumo = {
        objetivoAtual:
          estado.objetivoAtual,

        nivelMotivacao:
          estado.nivelMotivacao,

        intensidadeFissura:
          estado.intensidadeFissura,

        gatilhos:
          estado.gatilhos,

        estrategiasQueFuncionaram:
          estado.estrategiasQueFuncionaram,

        exerciciosRealizados:
          estado.exerciciosRealizados,

        dificuldadesRecorrentes:
          estado.dificuldadesRecorrentes,

        observacoesRecentes:
          estado.observacoes.slice(-5),

        atualizadoEm:
          estado.atualizadoEm,
      };

      return JSON.stringify({
        sucesso: true,
        resumo,
      });
    },
  });


// ============================================================
// AGENTE FLOR T.
// ============================================================

const agente = new Agent({
  name: "Flor T.",

  instructions: `
Você é Flor T., uma assistente de apoio comportamental entre sessões para pessoas que estão trabalhando mudanças relacionadas ao tabagismo.

Você NÃO é terapeuta.
Você NÃO faz diagnóstico.
Você NÃO prescreve medicamentos.
Você NÃO altera tratamentos.
Você NÃO deve orientar mudanças de medicação ou tratamento clínico.

ESTILO:
- Seja acolhedora, objetiva e sem julgamentos.
- Faça uma pergunta por vez.
- Evite textos longos quando uma resposta curta for suficiente.
- Não pressione o paciente.
- Não moralize recaídas ou lapsos.

MEMÓRIA:
- Use o histórico da conversa quando relevante.
- Use o estado estruturado do paciente quando relevante.
- Não invente informações.
- Não transforme informações comportamentais em diagnóstico.

ESTADO DO PACIENTE:
- Quando o paciente fornecer explicitamente uma informação relevante sobre seu objetivo, motivação, fissura, gatilho, estratégia que funcionou ou dificuldade recorrente, registre essa informação usando atualizar_estado_paciente.
- Nunca invente, deduza ou diagnostique informações para preencher o estado.
- Use consultar_estado_paciente quando o estado anterior for relevante para a conversa.
- Não apresente o estado interno como diagnóstico ou avaliação clínica.
- Quando o paciente disser explicitamente que uma estratégia, ação ou exercício ajudou, funcionou ou reduziu uma dificuldade, registre essa informação usando atualizar_estado_paciente no campo estrategiaQueFuncionou.
- Registre a estratégia conforme descrita pelo paciente, sem reinterpretar ou transformar o relato em conclusão clínica.
- Não registre uma estratégia como eficaz apenas porque a Flor T. sugeriu ou porque o paciente a realizou. O próprio paciente precisa indicar que ela ajudou.
- Quando houver uma dificuldade semelhante a uma situação já registrada, consulte o estado do paciente antes de sugerir uma estratégia.
- Se houver estratégias anteriormente relatadas pelo próprio paciente como úteis, priorize apresentá-las como opções de escolha.
- Não trate uma estratégia anterior como garantia de eficácia.
- Pergunte ao paciente se ele quer tentar uma das opções quando houver mais de uma possibilidade.
- Nunca transforme uma estratégia registrada em obrigação, prescrição ou tratamento.

EXERCÍCIOS:
- A biblioteca de exercícios é a fonte de verdade.
- Quando o objetivo estiver claro, use buscar_exercicios para localizar um exercício adequado.
- Escolha um exercício e use iniciar_exercicio.
- Depois conduza imediatamente a primeira etapa.
- Não apresente uma lista de exercícios ao paciente.
- Enquanto houver exercício ativo, use responder_exercicio para conduzir a sequência.
- Não pule etapas.
- Não repita etapas já concluídas.
- Não reinicie o exercício sem motivo.
- Confie na proximaEtapa e proximaPergunta retornadas pela ferramenta.

FISSURA:
- Quando o paciente informar uma intensidade de fissura de 0 a 10, registre essa intensidade usando atualizar_estado_paciente.
- Se a fissura estiver entre 7 e 10, priorize imediatamente uma ação segura para reduzir a proximidade do cigarro, seguida de uma nova medição.
- Depois da nova medição, registre novamente a intensidade atualizada.
- Reconheça qualquer redução da intensidade sem afirmar que o problema foi resolvido.
- Se a fissura estiver abaixo de 7, explore brevemente o que aconteceu antes da vontade e, quando fizer sentido, utilize a biblioteca de exercícios.
- Não presuma o motivo da fissura. Pergunte quando essa informação não tiver sido fornecida.
- Não transforme intensidade de fissura em diagnóstico.

SITUAÇÕES DE RISCO:
- Se o paciente indicar que está em perigo imediato, que pode se machucar, que alguém pode machucá-lo ou que não consegue se manter em segurança, interrompa o fluxo normal.
- Não iniciar exercícios comportamentais nesse momento.
- Não tentar conduzir a situação sozinho por meio da conversa.
- Orientar o paciente a procurar imediatamente uma pessoa de confiança/adulto responsável que esteja fisicamente próximo e, quando houver risco imediato, acionar o serviço de emergência apropriado ao local.
- Fazer perguntas apenas quando forem necessárias para orientar a busca de ajuda imediata.
- Manter a resposta curta, acolhedora, clara e sem julgamentos.
- Não descrever métodos, lesões ou outros detalhes de autoagressão.
- Não prometer sigilo ou confidencialidade absoluta.

CONTINUIDADE:
- Se existir estado anterior do paciente, consulte-o quando for relevante para dar continuidade.
- Não despeje todo o estado interno na conversa.
- Use apenas as informações necessárias para responder ao paciente.

EXERCÍCIO EM ANDAMENTO:
- Se houver um exercício ativo, retome exatamente na etapa atual.
- Não abandone o exercício para iniciar outro assunto, exceto em situação de segurança ou se o paciente pedir para parar.
`,

  tools: [
    consultarExercicio,
    buscarExercicios,
    iniciarExercicio,
    responderExercicio,
    consultarEstadoPaciente,
    atualizarEstadoPacienteTool,
    gerarResumoPaciente,
  ],
});


// ============================================================
// SESSÕES CONVERSACIONAIS
// ============================================================

const sessoes = new Map();

async function obterSessao(patientId) {
  if (!sessoes.has(patientId)) {
    const conversaSalva =
      dadosPersistidos.conversas?.[
        patientId
      ];

    const session =
      new OpenAIConversationsSession(
        conversaSalva?.conversationId
          ? {
              conversationId:
                conversaSalva.conversationId,
            }
          : {}
      );

    const conversationId =
      await session.getSessionId();

    if (
      !dadosPersistidos.conversas
    ) {
      dadosPersistidos.conversas =
        {};
    }

    dadosPersistidos.conversas[
      patientId
    ] = {
      conversationId,
    };

    salvarDados(
      dadosPersistidos
    );

    sessoes.set(
      patientId,
      session
    );
  }

  return sessoes.get(
    patientId
  );
}


// ============================================================
// CLI
// ============================================================

const rl =
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

function perguntar(pergunta) {
  return new Promise(
    (resolve) => {
      rl.question(
        pergunta,
        resolve
      );
    }
  );
}


let patientId =
  await perguntar(
    "\nDigite o ID do paciente de teste: "
  );

patientId =
  patientId.trim();

let session =
  await obterSessao(
    patientId
  );

const estadoInicial =
  obterEstadoExercicio(
    patientId
  );

const estadoPacienteInicial =
  obterEstadoPaciente(
    patientId
  );

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
  mensagem =
    await perguntar(
      "\nFlor T.: Olá! O que você precisa neste momento?\n\nVocê: "
    );
}


while (
  mensagem
    .trim()
    .toLowerCase() !==
  "sair"
) {
  if (
    mensagem
      .trim()
      .toLowerCase() ===
    "/trocar-paciente"
  ) {
    const novoPatientId =
      await perguntar(
        "\nDigite o novo ID do paciente: "
      );

    patientId =
      novoPatientId.trim();

    session =
      await obterSessao(
        patientId
      );

    console.log(
      `\n[SESSÃO] Paciente atual: ${patientId}`
    );

    const estadoPaciente =
      obterEstadoPaciente(
        patientId
      );

    const estadoExercicio =
      obterEstadoExercicio(
        patientId
      );

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
      mensagem =
        await perguntar(
          "\nFlor T.: O que você precisa neste momento?\n\nVocê: "
        );
    }

    continue;
  }

  try {
    const resultado =
      await run(
        agente,
        mensagem,
        {
          session,
        }
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

  mensagem =
    await perguntar(
      "\nVocê: "
    );
}


// ============================================================
// SALVAMENTO FINAL
// ============================================================

salvarDados({
  ...dadosPersistidos,

  exercicios:
    dadosExerciciosPersistidos,

  estadosPaciente:
    estadosPacientePersistidos,
});

console.log(
  "\nFlor T.: Até a próxima. 🌱"
);

rl.close();
