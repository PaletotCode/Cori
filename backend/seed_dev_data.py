"""
Seeder de Stress Test — 30 Pacientes
Apaga todos os dados do Dr. Mock (ID 999) e recria do zero.
Cobre absolutamente todos os cenários do MVP.
"""
import os
import sys
import random
from datetime import date, datetime, timedelta, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import SessionLocal
from backend.models.psicologo import Psicologo
from backend.models.paciente import Paciente, StatusPaciente
from backend.models.sessao import Sessao, EstadoSessao
from backend.models.tarefa_paciente import TarefaPaciente, StatusTarefa
from backend.models.checkin_diario import CheckInDiario
from backend.models.anotacao_clinica import AnotacaoClinica, TipoAnotacao
from backend.models.fatura import Fatura, EstadoFatura

NOW = datetime.now(timezone.utc)
TODAY = NOW.date()


def ago(days=0, hours=0) -> datetime:
    return NOW - timedelta(days=days, hours=hours)


def ahead(days=0, hours=0) -> datetime:
    return NOW + timedelta(days=days, hours=hours)


def today_at(hour: int, minute: int = 0) -> datetime:
    return NOW.replace(hour=hour, minute=minute, second=0, microsecond=0)


# ── Pacientes ────────────────────────────────────────────────────────────────

PACIENTES_DEF = [
    # ── 5 com sessões HOJE ───────────────────────────────────────────────────
    {
        "nome_completo": "Mariana Costa",
        "status": StatusPaciente.ativo,
        "valor_sessao": 200.0,
        "descricao": "TCC para TOC e rituais compulsivos.",
        "whatsapp": "11911111111",
        "nascimento": date(1993, 3, 12),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Rafael Souza",
        "status": StatusPaciente.ativo,
        "valor_sessao": 180.0,
        "descricao": "TDAH adulto e dificuldades profissionais.",
        "whatsapp": "11922222222",
        "nascimento": date(1988, 7, 25),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Juliana Ferreira",
        "status": StatusPaciente.ativo,
        "valor_sessao": 220.0,
        "descricao": "Burnout severo após promoção.",
        "whatsapp": "11933333333",
        "nascimento": date(1996, 11, 3),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Diego Almeida",
        "status": StatusPaciente.ativo,
        "valor_sessao": 150.0,
        "descricao": "Luto por perda do pai durante a pandemia.",
        "whatsapp": "11944444444",
        "nascimento": date(1990, 6, 18),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Camila Torres",
        "status": StatusPaciente.ativo,
        "valor_sessao": 170.0,
        "descricao": "Transtorno borderline — ciclos de idealização.",
        "whatsapp": "11955555555",
        "nascimento": date(2000, 2, 28),
        "pronomes": "ela/dela",
    },
    # ── 10 ativos com histórico rico ─────────────────────────────────────────
    {
        "nome_completo": "Beatriz Mendes",
        "status": StatusPaciente.ativo,
        "valor_sessao": 200.0,
        "descricao": "Ansiedade generalizada e fobia social.",
        "whatsapp": "11966666666",
        "nascimento": date(1985, 8, 14),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "André Lima",
        "status": StatusPaciente.ativo,
        "valor_sessao": 250.0,
        "descricao": "Transtorno de pânico com agorafobia.",
        "whatsapp": "11977777777",
        "nascimento": date(1982, 4, 7),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Larissa Oliveira",
        "status": StatusPaciente.ativo,
        "valor_sessao": 160.0,
        "descricao": "Depressão recorrente pós-parto.",
        "whatsapp": "11988888888",
        "nascimento": date(1991, 12, 22),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Thiago Rocha",
        "status": StatusPaciente.ativo,
        "valor_sessao": 190.0,
        "descricao": "Dependência de álcool — abstinência há 8 meses.",
        "whatsapp": "11999111111",
        "nascimento": date(1979, 9, 30),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Nathalia Gomes",
        "status": StatusPaciente.ativo,
        "valor_sessao": 210.0,
        "descricao": "PTSD após acidente de carro.",
        "whatsapp": "11999222222",
        "nascimento": date(1994, 1, 16),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Lucas Barbosa",
        "status": StatusPaciente.ativo,
        "valor_sessao": 180.0,
        "descricao": "Fobia específica de injeções — cirurgia próxima.",
        "whatsapp": "11999333333",
        "nascimento": date(1997, 5, 20),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Fernanda Castro",
        "status": StatusPaciente.ativo,
        "valor_sessao": 230.0,
        "descricao": "Transtorno alimentar (ARFID) em remissão.",
        "whatsapp": "11999444444",
        "nascimento": date(1987, 10, 11),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Mateus Correia",
        "status": StatusPaciente.ativo,
        "valor_sessao": 175.0,
        "descricao": "Hipocondria e ansiedade de saúde.",
        "whatsapp": "11999555555",
        "nascimento": date(1983, 3, 5),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Gabriela Nunes",
        "status": StatusPaciente.ativo,
        "valor_sessao": 200.0,
        "descricao": "Procrastinação grave impactando carreira.",
        "whatsapp": "11999666666",
        "nascimento": date(1999, 7, 27),
        "pronomes": "ela/elas",
    },
    {
        "nome_completo": "Pedro Henrique Motta",
        "status": StatusPaciente.ativo,
        "valor_sessao": 220.0,
        "descricao": "Dificuldades relacionais e apego ansioso.",
        "whatsapp": "11999777777",
        "nascimento": date(1992, 2, 9),
        "pronomes": "ele/dele",
    },
    # ── 5 ativos sem sessões futuras (inativos na prática) ───────────────────
    {
        "nome_completo": "Isabela Freitas",
        "status": StatusPaciente.ativo,
        "valor_sessao": 160.0,
        "descricao": "Iniciou mas parou frequência há 2 meses.",
        "whatsapp": None,
        "nascimento": date(1995, 6, 3),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Sandro Pires",
        "status": StatusPaciente.ativo,
        "valor_sessao": 140.0,
        "descricao": "Problemas relacionados a trabalho e estresse.",
        "whatsapp": "11900111111",
        "nascimento": date(1986, 8, 29),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Vanessa Lopes",
        "status": StatusPaciente.ativo,
        "valor_sessao": 190.0,
        "descricao": "Conflitos familiares pós-separação.",
        "whatsapp": None,
        "nascimento": date(1989, 4, 14),
        "pronomes": "elu/delu",
    },
    {
        "nome_completo": "Rodrigo Teixeira",
        "status": StatusPaciente.ativo,
        "valor_sessao": 155.0,
        "descricao": "Insônia crônica e pensamentos ruminativos.",
        "whatsapp": "11900333333",
        "nascimento": date(1984, 11, 1),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Priscila Moura",
        "status": StatusPaciente.ativo,
        "valor_sessao": 200.0,
        "descricao": "Trauma de infância — memórias dissociativas.",
        "whatsapp": "11900444444",
        "nascimento": date(1990, 9, 17),
        "pronomes": "ela/dela",
    },
    # ── 5 com faturas atrasadas / pendentes ──────────────────────────────────
    {
        "nome_completo": "Gustavo Martins",
        "status": StatusPaciente.ativo,
        "valor_sessao": 200.0,
        "descricao": "Ansiedade social intensa em reuniões.",
        "whatsapp": "11801111111",
        "nascimento": date(1988, 10, 5),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Aline Ribeiro",
        "status": StatusPaciente.ativo,
        "valor_sessao": 180.0,
        "descricao": "Depressão moderada com ideação.",
        "whatsapp": "11802222222",
        "nascimento": date(1993, 2, 22),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Henrique Azevedo",
        "status": StatusPaciente.ativo,
        "valor_sessao": 220.0,
        "descricao": "Estresse pós-traumático por assalto.",
        "whatsapp": "11803333333",
        "nascimento": date(1977, 7, 15),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Tatiana Carvalho",
        "status": StatusPaciente.ativo,
        "valor_sessao": 170.0,
        "descricao": "Luto complicado — filha.",
        "whatsapp": "11804444444",
        "nascimento": date(1971, 5, 28),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Leonardo Vieira",
        "status": StatusPaciente.ativo,
        "valor_sessao": 195.0,
        "descricao": "Perfeccionismo patológico e autoexigência.",
        "whatsapp": "11805555555",
        "nascimento": date(1986, 12, 11),
        "pronomes": "ele/dele",
    },
    # ── 5 pendentes de aprovação (triagem) ───────────────────────────────────
    {
        "nome_completo": "Carolina Duarte",
        "status": StatusPaciente.pendente_aprovacao,
        "valor_sessao": None,
        "descricao": "Sofro com muito estresse no trabalho e insônia. Preciso de ajuda.",
        "whatsapp": "11701111111",
        "nascimento": date(1998, 4, 2),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Renato Fonseca",
        "status": StatusPaciente.pendente_aprovacao,
        "valor_sessao": None,
        "descricao": "Crise no casamento. Procuro terapia de casal inicialmente individual.",
        "whatsapp": "11702222222",
        "nascimento": date(1981, 8, 30),
        "pronomes": "ele/dele",
    },
    {
        "nome_completo": "Mônica Andrade",
        "status": StatusPaciente.pendente_aprovacao,
        "valor_sessao": None,
        "descricao": "Muito ansiedade e pensamentos negativos frequentes.",
        "whatsapp": None,
        "nascimento": date(2002, 1, 15),
        "pronomes": "ela/dela",
    },
    {
        "nome_completo": "Felipe Nascimento",
        "status": StatusPaciente.pendente_aprovacao,
        "valor_sessao": None,
        "descricao": "Dificuldades com self-harm. Quero parar.",
        "whatsapp": "11704444444",
        "nascimento": date(2004, 6, 7),
        "pronomes": "ele/ele",
    },
    {
        "nome_completo": "Manuela Dias",
        "status": StatusPaciente.pendente_aprovacao,
        "valor_sessao": None,
        "descricao": "Me sinto sozinha e sem propósito após me aposentar.",
        "whatsapp": "11705555555",
        "nascimento": date(1958, 10, 20),
        "pronomes": "ela/dela",
    },
]


NOTAS_TEMPLATES = [
    "Paciente relatou melhora significativa nos episódios de ansiedade. Estratégias de respiração diafragmática aplicadas com sucesso. Tarefa: continuar diário de pensamentos.",
    "Sessão produtiva. Trabalhamos em técnicas de exposição gradual. Paciente demonstrou resistência inicial mas cedeu ao final. Próxima sessão: revisar diário e introduzir relaxamento muscular.",
    "Paciente chegou em estado de grande agitação após conflito familiar. Utilizamos técnica de regulação emocional. Sessão encerrada com paciente em estado mais calmo. Atenção para próximo retorno.",
    "Boa evolução no controle dos pensamentos ruminativos. A reestruturação cognitiva parece estar surtindo efeito. Paciente conta que dormiu melhor essa semana.",
    "Sessão de acompanhamento. Revisamos o plano terapêutico e ajustamos metas. Paciente expressa desejo de trabalhar aspectos de autoestima nas próximas sessões.",
    "Paciente relata episódio de craving, mas conseguiu usar as estratégias de enfrentamento aprendidas. Celebração do progresso. Reforço do plano de contingência.",
    "Trabalho com o trauma central. Paciente acessou memória dolorosa com suporte. Encerramos a sessão com ancoragem no presente. Necessário monitorar nos próximos dias.",
    "Foco em habilidades interpessoais. Role-play de situação conflituosa no trabalho. Paciente demonstra progresso na assertividade.",
]

TAREFAS_TEMPLATES = [
    ("Diário de Pensamentos", "Registrar 3 situações de gatilho por dia, com pensamento automático e alternativo."),
    ("Respiração 4-7-8", "Praticar o exercício de respiração 4-7-8 por 5 minutos antes de dormir."),
    ("Lista de Atividades Prazerosas", "Criar uma lista com 10 atividades que trazem prazer e realizar pelo menos 2 esta semana."),
    ("Exposição Gradual", "Entrar em 1 situação temida por dia, começando pelo nível mais baixo da hierarquia."),
    ("Carta de Autocompaixão", "Escrever uma carta para si mesmo como faria para um amigo em crise."),
    ("Monitorar Sono", "Preencher registro de sono: horário de deitar, despertar e qualidade (1-5)."),
    ("Ativação Comportamental", "Sair de casa pelo menos 20 minutos por dia, mesmo que apenas para caminhar."),
    ("Ligar para alguém", "Entrar em contato com uma pessoa próxima que não vê há muito tempo."),
]


def seed():
    db = SessionLocal()

    print("🗑️  Limpando dados antigos do Dr. Mock (ID=999)...")

    # Deleta em cascade — basta deletar pacientes
    pacientes_antigos = db.query(Paciente).filter(Paciente.psicologo_id == 999).all()
    for p in pacientes_antigos:
        db.delete(p)
    db.commit()

    # Garante Dr. Mock
    psi = db.query(Psicologo).filter(Psicologo.id == 999).first()
    if not psi:
        psi = Psicologo(id=999, google_id="dev_bypass_mock_id", email="dev@teste.com",
                        nome_exibicao="Dr. Mock", slug_link_publico="dr-mock")
        db.add(psi)
        db.commit()

    print(f"👨‍⚕️ Criando {len(PACIENTES_DEF)} pacientes...")

    all_pacientes = []
    for i, pdef in enumerate(PACIENTES_DEF):
        meios = {}
        if pdef["whatsapp"]:
            meios["whatsapp"] = pdef["whatsapp"]

        pac = Paciente(
            psicologo_id=999,
            nome_completo=pdef["nome_completo"],
            status=pdef["status"],
            descricao_clinica=pdef["descricao"],
            meios_comunicacao=meios if meios else None,
            data_nascimento=pdef["nascimento"],
            pronomes_genero=pdef.get("pronomes"),
            valor_sessao=pdef["valor_sessao"],
        )
        db.add(pac)
        all_pacientes.append((pac, pdef))

    db.commit()
    for pac, _ in all_pacientes:
        db.refresh(pac)

    print("📅 Gerando sessões, check-ins, tarefas e anotações...")

    # ── Grupo 1: 5 pacientes com sessões HOJE ─────────────────────────────────
    hora_hoje = [9, 11, 14, 15, 17]
    estados_hoje = [
        EstadoSessao.confirmada,
        EstadoSessao.agendada,
        EstadoSessao.realizada,
        EstadoSessao.falta_cobrada,
        EstadoSessao.agendada,
    ]
    for idx in range(5):
        pac, _ = all_pacientes[idx]
        hora = hora_hoje[idx]
        estado = estados_hoje[idx]
        s = Sessao(
            paciente_id=pac.id,
            estado=estado,
            data_hora_inicio=today_at(hora),
            data_hora_fim=today_at(hora, 50),
            valor_cobrado=pac.valor_sessao,
        )
        db.add(s)
        db.flush()

        # Anotação para sessões realizadas de hoje
        if estado in (EstadoSessao.realizada, EstadoSessao.falta_cobrada):
            db.add(AnotacaoClinica(
                paciente_id=pac.id,
                sessao_id=s.id,
                conteudo=random.choice(NOTAS_TEMPLATES),
                tipo=TipoAnotacao.evolucao_oficial,
            ))

        # check-in do paciente de hoje
        db.add(CheckInDiario(
            paciente_id=pac.id,
            nivel_humor=random.randint(2, 5),
            nivel_ansiedade=random.randint(3, 8),
        ))

    # ── Grupo 2: 10 pacientes com histórico rico ──────────────────────────────
    for idx in range(5, 15):
        pac, _ = all_pacientes[idx]

        # 8 sessões nos últimos 56 dias (a cada ~7 dias)
        for w in range(8):
            dias_atras = 56 - (w * 7)
            hora_sessao = random.choice([10, 11, 14, 15, 16])
            estado = EstadoSessao.realizada if dias_atras > 0 else EstadoSessao.agendada

            s = Sessao(
                paciente_id=pac.id,
                estado=estado,
                data_hora_inicio=ago(days=dias_atras, hours=0).replace(hour=hora_sessao, minute=0, second=0, microsecond=0),
                data_hora_fim=ago(days=dias_atras, hours=0).replace(hour=hora_sessao, minute=50, second=0, microsecond=0),
                valor_cobrado=pac.valor_sessao,
            )
            db.add(s)
            db.flush()

            if estado == EstadoSessao.realizada:
                db.add(AnotacaoClinica(
                    paciente_id=pac.id, sessao_id=s.id,
                    conteudo=NOTAS_TEMPLATES[w % len(NOTAS_TEMPLATES)],
                    tipo=TipoAnotacao.evolucao_oficial,
                ))

        # 5 check-ins aleatórios
        for _ in range(5):
            db.add(CheckInDiario(
                paciente_id=pac.id,
                nivel_humor=random.randint(1, 5),
                nivel_ansiedade=random.randint(1, 10),
                anotacao_paciente=random.choice(["Dia agitado", "Me senti mais calmo hoje", "Difícil dormir", None]),
            ))

        # 2 tarefas
        for t_idx in range(2):
            titulo, desc = TAREFAS_TEMPLATES[(idx + t_idx) % len(TAREFAS_TEMPLATES)]
            status_t = random.choice([StatusTarefa.pendente, StatusTarefa.concluida, StatusTarefa.pendente])
            db.add(TarefaPaciente(
                paciente_id=pac.id,
                titulo=titulo,
                descricao=desc,
                status=status_t,
                data_vencimento=NOW + timedelta(days=random.randint(-3, 10)),
            ))

    # ── Grupo 3: 5 ativos inativos (só sessões antigas) ───────────────────────
    for idx in range(15, 20):
        pac, _ = all_pacientes[idx]
        # 2 sessões há mais de 60 dias (sumiu do radar)
        for w in range(2):
            dias_atras = 75 - (w * 7)
            s = Sessao(
                paciente_id=pac.id,
                estado=EstadoSessao.realizada,
                data_hora_inicio=ago(days=dias_atras).replace(hour=10, minute=0, second=0, microsecond=0),
                data_hora_fim=ago(days=dias_atras).replace(hour=10, minute=50, second=0, microsecond=0),
                valor_cobrado=pac.valor_sessao,
            )
            db.add(s)
            db.flush()
            db.add(AnotacaoClinica(
                paciente_id=pac.id, sessao_id=s.id,
                conteudo=random.choice(NOTAS_TEMPLATES),
                tipo=TipoAnotacao.evolucao_oficial,
            ))

    # ── Grupo 4: 5 com faturas pendentes / atrasadas ──────────────────────────
    for idx in range(20, 25):
        pac, pdef = all_pacientes[idx]

        # 4 sessões realizadas no mês passado
        mes_passado = (TODAY.month - 1) or 12
        ano_ref = TODAY.year if TODAY.month > 1 else TODAY.year - 1
        for w in range(4):
            dias_atras = 30 + (w * 7)
            s = Sessao(
                paciente_id=pac.id,
                estado=EstadoSessao.realizada,
                data_hora_inicio=ago(days=dias_atras).replace(hour=10, minute=0, second=0, microsecond=0),
                data_hora_fim=ago(days=dias_atras).replace(hour=10, minute=50, second=0, microsecond=0),
                valor_cobrado=pdef["valor_sessao"],
            )
            db.add(s)
            db.flush()

        # Fatura pendente ou atrasada
        estado_fatura = EstadoFatura.atrasada if idx % 2 == 0 else EstadoFatura.pendente
        vencimento = TODAY - timedelta(days=30 if estado_fatura == EstadoFatura.atrasada else -5)
        fatura = Fatura(
            paciente_id=pac.id,
            mes_referencia=mes_passado,
            ano_referencia=ano_ref,
            valor_total=pdef["valor_sessao"] * 4,
            estado=estado_fatura,
            data_vencimento=vencimento,
        )
        db.add(fatura)

    # ── Grupo 5: 5 pendentes de aprovação — sem sessões ───────────────────────
    # Nada a fazer; já têm status=pendente_aprovacao

    db.commit()

    # Contar stats
    total_pac = db.query(Paciente).filter(Paciente.psicologo_id == 999).count()
    total_ses = db.query(Sessao).join(Paciente).filter(Paciente.psicologo_id == 999).count()
    total_fat = db.query(Fatura).join(Paciente).filter(Paciente.psicologo_id == 999).count()

    print(f"\n✅ Seeder concluído com sucesso!")
    print(f"   Pacientes: {total_pac}")
    print(f"   Sessões:   {total_ses}")
    print(f"   Faturas:   {total_fat}")
    print(f"\n   Sessões de HOJE:")
    for idx in range(5):
        pac, _ = all_pacientes[idx]
        print(f"   - {pac.nome_completo} às {hora_hoje[idx]}h — {estados_hoje[idx].value}")


if __name__ == "__main__":
    seed()
