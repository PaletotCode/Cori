import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "../backend/cori.db")

def limpar_banco():
    if not os.path.exists(DB_PATH):
        print(f"Banco de dados não encontrado em {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Desabilita restrições de chave estrangeira temporariamente
        cursor.execute("PRAGMA foreign_keys = OFF;")
        
        # Tabelas a serem limpas
        tabelas = [
            "faturas",
            "sessoes",
            "tarefas_paciente",
            "checkins_diarios",
            "pacientes"
        ]
        
        for tabela in tabelas:
            print(f"Limpando tabela {tabela}...")
            cursor.execute(f"DELETE FROM {tabela};")
            # Resetando o autoincrement
            cursor.execute(f"UPDATE sqlite_sequence SET seq = 0 WHERE name = '{tabela}';")
            
        conn.commit()
        print("✅ Dados de teste limpados com sucesso! Os psicólogos foram mantidos.")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Erro ao limpar o banco de dados: {e}")
        
    finally:
        # Reabilita chaves estrangeiras
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.close()

if __name__ == "__main__":
    confirmacao = input("Atenção: Isso removerá TODOS os pacientes, sessões, faturas e tarefas. Continuar? (s/n): ")
    if confirmacao.lower() == 's':
        limpar_banco()
    else:
        print("Operação cancelada.")
