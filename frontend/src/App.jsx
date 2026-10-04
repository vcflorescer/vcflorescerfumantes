import { useState } from "react";

function App() {
  const [patientId, setPatientId] = useState(
    () => sessionStorage.getItem("flor_patient_id") || ""
  );
  const [codigoDigitado, setCodigoDigitado] = useState(
    () => sessionStorage.getItem("flor_patient_id") || ""
  );
  const [mensagem, setMensagem] = useState("");
  const [mensagens, setMensagens] = useState([
    {
      tipo: "flor",
      texto: "Olá! Estou aqui com você. Como posso apoiar você hoje?",
    },
  ]);
  const [carregando, setCarregando] = useState(false);

  function entrar() {
    const codigo = codigoDigitado.trim();

    if (!codigo) return;

    sessionStorage.setItem("flor_patient_id", codigo);
    setPatientId(codigo);
  }

  function sair() {
    sessionStorage.removeItem("flor_patient_id");
    setPatientId("");
    setCodigoDigitado("");
    setMensagens([
      {
        tipo: "flor",
        texto: "Olá! Estou aqui com você. Como posso apoiar você hoje?",
      },
    ]);
    setMensagem("");
  }

  async function enviarMensagem(event) {
    event.preventDefault();

    const texto = mensagem.trim();

    if (!patientId || !texto || carregando) return;

    setMensagens((anteriores) => [
      ...anteriores,
      { tipo: "paciente", texto },
    ]);

    setMensagem("");
    setCarregando(true);

    try {
      const respostaApi = await fetch("/api/mensagem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId,
          mensagem: texto,
        }),
      });

      const dados = await respostaApi.json();

      if (!respostaApi.ok) {
        throw new Error(dados.erro || "Erro na API.");
      }

      setMensagens((anteriores) => [
        ...anteriores,
        {
          tipo: "flor",
          texto: dados.resposta,
        },
      ]);
    } catch (erro) {
      setMensagens((anteriores) => [
        ...anteriores,
        {
          tipo: "flor",
          texto: `Não consegui processar sua mensagem: ${erro.message}`,
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="app">
      <header className="cabecalho">
        <h1>Flor T.</h1>
        <span>Seu espaço de apoio</span>
      </header>

      {!patientId ? (
        <section className="identificacao">
          <h2>Identificação</h2>

          <p>
            Digite o código de paciente fornecido para você.
          </p>

          <div className="entrada-identificacao">
            <input
              value={codigoDigitado}
              onChange={(event) =>
                setCodigoDigitado(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  entrar();
                }
              }}
              placeholder="Código do paciente"
              autoComplete="off"
            />

            <button
              type="button"
              onClick={entrar}
              disabled={!codigoDigitado.trim()}
            >
              Entrar
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="paciente-logado">
            <span>Paciente conectado: {patientId}</span>

            <button type="button" onClick={sair}>
              Sair
            </button>
          </div>

          <section className="chat">
            {mensagens.map((item, indice) => (
              <div
                key={indice}
                className={`mensagem ${
                  item.tipo === "flor"
                    ? "mensagem-flor"
                    : "mensagem-paciente"
                }`}
              >
                <div className="nome">
                  {item.tipo === "flor" ? "Flor T." : "Você"}
                </div>

                <div className="balao">
                  {item.texto}
                </div>
              </div>
            ))}

            {carregando && (
              <div className="mensagem mensagem-flor">
                <div className="nome">Flor T.</div>
                <div className="balao digitando">
                  Pensando...
                </div>
              </div>
            )}
          </section>

          <form className="formulario" onSubmit={enviarMensagem}>
            <input
              value={mensagem}
              onChange={(event) =>
                setMensagem(event.target.value)
              }
              placeholder="Digite sua mensagem..."
              disabled={carregando}
            />

            <button
              type="submit"
              disabled={carregando || !mensagem.trim()}
            >
              {carregando ? "..." : "Enviar"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

export default App;
