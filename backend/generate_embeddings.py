
import psycopg2
from sentence_transformers import SentenceTransformer

# Load the embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Connect to CampusPilot's database
db = psycopg2.connect(
    dbname="campuspilot",
    user="chiranjeev",
    host="localhost"
)

cursor = db.cursor()

# Get chunks that do not have embeddings yet
cursor.execute("""
    SELECT id, chunk_text
    FROM document_chunks
    WHERE embedding IS NULL
""")

chunks = cursor.fetchall()

print(f"Found {len(chunks)} chunks without embeddings.")

for chunk_id, chunk_text in chunks:
    # Convert text into a 384-dimensional vector
    embedding = model.encode(chunk_text).tolist()

    # Store the vector in PostgreSQL
    cursor.execute(
        """
        UPDATE document_chunks
        SET embedding = %s
        WHERE id = %s
        """,
        (embedding, chunk_id)
    )

db.commit()
cursor.close()
db.close()

print("Embeddings generated and saved successfully!")
