import { useState } from "react";

function App() {
  const [patientId, setPatientId] = useState(
    () => sessionStorage.getItem("flor_patient_id") || ""
  );

  const [token, setToken] = useState(
    () => sessionStorage.getItem("flor_auth_token") || ""
  );
  const [codigoDigitado, setCodigoDigitado] = useState(
    () => sessionStorage.getItem("flor_patient_id") || ""
  );
  const [segredo, setSegredo] = useState("");
  const [erroLogin, setErroLogin] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [mensagens, setMensagens] = useState([
    {
      tipo: "flor",
      texto: "Olá! Estou aqui com você. Como posso apoiar você hoje?",
    },
  ]);
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    const codigo = codigoDigitado.trim();
    const senha = segredo.trim();

    if (!codigo || !senha) return;

    setErroLogin("");

    try {
      const resposta = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId: codigo,
          segredo: senha,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Não foi possível entrar.");
      }

      sessionStorage.setItem("flor_patient_id", codigo);
      sessionStorage.setItem("flor_auth_token", dados.token);
      setPatientId(codigo);
      setToken(dados.token);
      setSegredo("");
    } catch (erro) {
      setErroLogin(erro.message);
    }
  }

  function sair() {
    sessionStorage.removeItem("flor_patient_id");
    sessionStorage.removeItem("flor_auth_token");
    setPatientId("");
    setToken("");
    setCodigoDigitado("");
    setSegredo("");
    setErroLogin("");
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
        if (respostaApi.status === 401) {
          sessionStorage.removeItem("flor_patient_id");
          sessionStorage.removeItem("flor_auth_token");
          setPatientId("");
          setToken("");
          setErroLogin("Sua sessão expirou. Entre novamente.");
          return;
        }

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

          <p>Digite o código de paciente e o código secreto fornecidos para você.</p>

          <div className="entrada-identificacao">
            <input
              value={codigoDigitado}
              onChange={(event) => setCodigoDigitado(event.target.value)}
              placeholder="Código do paciente"
              autoComplete="off"
            />

            <input
              type="password"
              value={segredo}
              onChange={(event) => setSegredo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  entrar();
                }
              }}
              placeholder="Código secreto"
              autoComplete="off"
            />

            <button
              type="button"
              onClick={entrar}
              disabled={!codigoDigitado.trim() || !segredo.trim()}
            >
              Entrar
            </button>
          </div>

          {erroLogin && <p className="erro-login">{erroLogin}</p>}
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

                <div className="balao">{item.texto}</div>
              </div>
            ))}

            {carregando && (
              <div className="mensagem mensagem-flor">
                <div className="nome">Flor T.</div>
                <div className="balao digitando">Pensando...</div>
              </div>
            )}
          </section>

          <form className="formulario" onSubmit={enviarMensagem}>
            <input
              value={mensagem}
              onChange={(event) => setMensagem(event.target.value)}
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
