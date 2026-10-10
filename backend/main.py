import os
from datetime import date
from io import BytesIO
from typing import Optional

import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

app = FastAPI()
load_dotenv()
db = psycopg2.connect(
    dbname="campuspilot",
    user="chiranjeev",
    host="localhost"
)
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "CampusPilot backend is running!"
    }


@app.get("/hello")
def hello():
    return {
        "message": "Hello from CampusPilot!"
    }


@app.get("/students")
def get_students():
    cursor = db.cursor()
    cursor.execute("SELECT id, name, semester, branch FROM students")
    rows = cursor.fetchall()
    cursor.close()
    students = []
    for row in rows:
        students.append({
            "id": row[0],
            "name": row[1],
            "semester": row[2],
            "branch": row[3]
        })
    return {
        "students": students
    }


class ChatRequest(BaseModel):
    message: str


def get_student(student_id):
    cursor = db.cursor()
    cursor.execute(
        "SELECT id, name, semester, branch FROM students WHERE id = %s",
        (student_id,)
    )
    row = cursor.fetchone()
    cursor.close()
    if row is None:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "semester": row[2],
        "branch": row[3]
    }


class TaskCreate(BaseModel):
    student_id: int
    subject_id: Optional[int] = None
    title: str
    due_date: Optional[date] = None


class StudyPreferences(BaseModel):
    student_id: int = 1
    daily_study_minutes: int = 120
    session_minutes: int = 40
    study_days: list[int] = [1, 2, 3, 4, 5, 6, 7]


@app.post("/chat")
def chat(request: ChatRequest):
    student = get_student(1)
    try:
        # Convert the question into an embedding
        question_embedding = embedding_model.encode(
            request.message
        ).tolist()
        # Format the embedding for PostgreSQL
        vector_string = "[" + ",".join(
            str(value) for value in question_embedding
        ) + "]"
        # Retrieve the four most relevant text chunks
        db = psycopg2.connect(
            dbname="campuspilot",
            user="chiranjeev",
            host="localhost"
        )
        try:
            cursor = db.cursor()
            cursor.execute(
                """
                
                SELECT dc.id, dc.chunk_text, sm.filename
                FROM document_chunks dc
                JOIN study_materials sm ON dc.material_id = sm.id
                WHERE dc.student_id = %s
                    AND dc.embedding IS NOT NULL
                ORDER BY dc.embedding <=> %s::vector
                LIMIT 4

                """,
                (1, vector_string)
            )
            results = cursor.fetchall()
            cursor.close()
        finally:
            db.close()
        # Prepare the retrieved notes
        
        context = "\n\n".join(
            f"Source: {filename} (Chunk ID: {chunk_id})\nContent: {chunk}"
            for chunk_id, chunk, filename in results
        )

        if not context:
            context = "No uploaded study material with embeddings was found."
        system_instruction = """
        You are CampusPilot, an AI college assistant.
        Help college students understand subjects, prepare for exams,
        create study plans, solve academic problems, and learn programming.
        Explain concepts clearly and simply.
        Use examples when useful.
        Explain programming and numerical problems step by step.
        Use the retrieved study material when it is relevant.
        Ground answers about uploaded documents in the retrieved text.
        If the material does not contain the answer, say so clearly.
        You may provide general knowledge separately when useful.
        Never claim that information came from a document unless
        the retrieved text supports that claim.
        """
        prompt = f"""
        {system_instruction}
        Student information:
        {student}
        Retrieved study material:
        {context}
        Student's question:
        {request.message}
        """
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
        
        return {
            "reply": response.choices[0].message.content,
            "sources": list(dict.fromkeys(
                filename for _, _, filename in results
            )),
            "evidence": [
                {
                    "chunk_id": chunk_id,
                    "filename": filename,
                    "text": chunk
                }
                for chunk_id, chunk, filename in results
            ]
        }

    except Exception as error:
        print("CampusPilot Chat Error:", error)
        return {
            "reply": (
                "CampusPilot is temporarily unable to answer. "
                "Please check the backend terminal and try again."
            ),
            "sources": []
        }


@app.get("/subjects")
def get_subjects():
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            subjects.id,
            students.name,
            subjects.name,
            subjects.code
        FROM subjects
        JOIN students
            ON students.id = subjects.student_id
    """)
    rows = cursor.fetchall()
    cursor.close()
    subjects = []
    for row in rows:
        subjects.append({
            "id": row[0],
            "student_name": row[1],
            "name": row[2],
            "code": row[3]
        })
    return {"subjects": subjects}


@app.get("/tasks")
def get_tasks():
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            study_tasks.id,
            study_tasks.title,
            subjects.name,
            study_tasks.due_date,
            study_tasks.completed
        FROM study_tasks
        LEFT JOIN subjects
            ON study_tasks.subject_id = subjects.id
        WHERE study_tasks.student_id = %s
        ORDER BY study_tasks.due_date NULLS LAST
    """, (1,))
    rows = cursor.fetchall()
    cursor.close()
    tasks = []
    for row in rows:
        tasks.append({
            "id": row[0],
            "title": row[1],
            "subject": row[2],
            "due_date": str(row[3]) if row[3] else None,
            "completed": row[4]
        })
    return {"tasks": tasks}


@app.post("/tasks")
def create_task(task: TaskCreate):
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO study_tasks
            (student_id, subject_id, title, due_date)
        VALUES (%s, %s, %s, %s)
        RETURNING id, student_id, subject_id, title, due_date, completed
        """,
        (
            task.student_id,
            task.subject_id,
            task.title,
            task.due_date
        )
    )
    row = cursor.fetchone()
    db.commit()
    cursor.close()
    return {
        "id": row[0],
        "student_id": row[1],
        "subject_id": row[2],
        "title": row[3],
        "due_date": str(row[4]) if row[4] else None,
        "completed": row[5]
    }


@app.patch("/tasks/{task_id}/complete")
def complete_task(task_id: int):
    cursor = db.cursor()
    cursor.execute(
        """
        UPDATE study_tasks
        SET completed = TRUE
        WHERE id = %s
        RETURNING id, title, completed
        """,
        (task_id,)
    )
    row = cursor.fetchone()
    db.commit()
    cursor.close()
    if row is None:
        return {"error": "Task not found"}
    return {
        "id": row[0],
        "title": row[1],
        "completed": row[2]
    }


@app.get("/study-plan")
def generate_study_plan():
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            subjects.name,
            study_tasks.title,
            study_tasks.due_date,
            study_tasks.completed
        FROM study_tasks
        LEFT JOIN subjects
            ON study_tasks.subject_id = subjects.id
        WHERE study_tasks.student_id = %s
        ORDER BY study_tasks.due_date NULLS LAST
    """, (1,))
    rows = cursor.fetchall()
    cursor.close()
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT daily_study_minutes, session_minutes, study_days
        FROM study_preferences
        WHERE student_id = %s
        """,
        (1,)
    )
    preference_row = cursor.fetchone()
    cursor.close()
    if preference_row:
        daily_minutes = preference_row[0]
        session_minutes = preference_row[1]
        study_days = preference_row[2]
    else:
        daily_minutes = 120
        session_minutes = 40
        study_days = [1, 2, 3, 4, 5, 6, 7]
    tasks = []
    for row in rows:
        tasks.append({
            "subject": row[0],
            "title": row[1],
            "due_date": str(row[2]) if row[2] else "No deadline",
            "completed": row[3]
        })
    pending_tasks = [
        task for task in tasks
        if not task["completed"]
    ]
    if not pending_tasks:
        return {
            "study_plan": "You have no pending tasks. Add some study tasks to generate a plan!"
        }
    prompt = f"""
    You are CampusPilot's expert academic study planner.
    Today's date: {date.today()}
    Student preferences:
    - Daily study time: {daily_minutes} minutes
    - Preferred session length: {session_minutes} minutes
    - Study days: {study_days}
      (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday,
       5=Friday, 6=Saturday, 7=Sunday)
    Pending tasks:
    {pending_tasks}
    Create a personalized and realistic study plan.
    Requirements:
    1. Respect the student's daily study-time limit.
    2. Use the preferred session length where practical.
    3. Schedule study sessions only on the selected study days.
    4. Prioritize overdue tasks and tasks with the nearest deadlines.
    5. Include the subject, exact task title, duration, and deadline.
    6. Include short breaks between sessions. Breaks do not count
       toward the daily study-time limit.
    7. Do not invent tasks or deadlines.
    8. If a deadline is overdue, flag it clearly.
    9. If the workload cannot fit before the deadlines, explain
       the conflict instead of promising an impossible schedule.
    10. Use clear Markdown headings, lists, and bold labels.
    Return Markdown only.
    """
    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are CampusPilot's intelligent study planner. "
                    "Create realistic, deadline-aware study schedules."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.4
    )
    return {
        "study_plan": response.choices[0].message.content
    }


@app.get("/preferences")
def get_preferences():
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT daily_study_minutes, session_minutes, study_days
        FROM study_preferences
        WHERE student_id = %s
        """,
        (1,)
    )
    row = cursor.fetchone()
    cursor.close()
    if row is None:
        return {
            "student_id": 1,
            "daily_study_minutes": 120,
            "session_minutes": 40,
            "study_days": [1, 2, 3, 4, 5, 6, 7]
        }
    return {
        "student_id": 1,
        "daily_study_minutes": row[0],
        "session_minutes": row[1],
        "study_days": row[2]
    }


@app.put("/preferences")
def update_preferences(preferences: StudyPreferences):
    if not 30 <= preferences.daily_study_minutes <= 720:
        return {"error": "Daily study time must be between 30 and 720 minutes"}
    if not 15 <= preferences.session_minutes <= 180:
        return {"error": "Session length must be between 15 and 180 minutes"}
    if any(day < 1 or day > 7 for day in preferences.study_days):
        return {"error": "Study days must be between 1 and 7"}
    if len(set(preferences.study_days)) != len(preferences.study_days):
        return {"error": "Study days cannot contain duplicates"}
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO study_preferences
            (student_id, daily_study_minutes, session_minutes, study_days)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (student_id)
        DO UPDATE SET
            daily_study_minutes = EXCLUDED.daily_study_minutes,
            session_minutes = EXCLUDED.session_minutes,
            study_days = EXCLUDED.study_days
        RETURNING daily_study_minutes, session_minutes, study_days
        """,
        (
            preferences.student_id,
            preferences.daily_study_minutes,
            preferences.session_minutes,
            preferences.study_days
        )
    )
    row = cursor.fetchone()
    db.commit()
    cursor.close()
    return {
        "student_id": preferences.student_id,
        "daily_study_minutes": row[0],
        "session_minutes": row[1],
        "study_days": row[2]
    }


def create_text_chunks(text, chunk_size=1200, overlap=200):
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        # Prefer splitting at a newline or space.
        if end < len(text):
            split_at = max(
                text.rfind("\n", start + chunk_size // 2, end),
                text.rfind(" ", start + chunk_size // 2, end)
            )
            if split_at > start:
                end = split_at
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks


@app.post("/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum size is 10 MB."
        )
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="This PDF is password-protected."
            )
        extracted_pages = []
        for page_number, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""
            if page_text.strip():
                extracted_pages.append(
                    f"--- Page {page_number} ---\n{page_text}"
                )
        extracted_text = "\n\n".join(extracted_pages)
        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text was found. This may be a scanned PDF."
            )
        chunks = create_text_chunks(extracted_text)
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Could not create text chunks from this PDF."
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF."
        )
    finally:
        await file.close()
    db = psycopg2.connect(
        dbname="campuspilot",
        user="chiranjeev",
        host="localhost"
    )
    try:
        cursor = db.cursor()
        student_id = 1
        cursor.execute(
            """
            INSERT INTO study_materials
                (student_id, filename, material_type,
                 extracted_text, total_pages)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                student_id,
                file.filename,
                "syllabus",
                extracted_text,
                len(reader.pages)
            )
        )
        material_id = cursor.fetchone()[0]
        for index, chunk in enumerate(chunks):
            embedding = embedding_model.encode(chunk).tolist()
            embedding_string = "[" + ",".join(
                str(value) for value in embedding
            ) + "]"
            cursor.execute(
                """
                INSERT INTO document_chunks
                    (material_id, student_id, chunk_index, chunk_text, embedding)
                VALUES (%s, %s, %s, %s, %s::vector)
                """,
                (
                    material_id,
                    student_id,
                    index,
                    chunk,
                    embedding_string
                )
            )
        db.commit()
        cursor.close()
        return {
            "message": "PDF uploaded and processed successfully.",
            "material_id": material_id,
            "filename": file.filename,
            "total_pages": len(reader.pages),
            "total_chunks": len(chunks)
        }
    except Exception as e:
        db.rollback()
        print("PDF upload error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Could not save the PDF and its text chunks."
        )
    finally:
        db.close()


@app.get("/study-materials")
def get_study_materials():
    db = psycopg2.connect(
        dbname="campuspilot",
        user="chiranjeev",
        host="localhost"
    )
    try:
        cursor = db.cursor()
        cursor.execute(
            """
            SELECT id, filename, material_type, total_pages, uploaded_at
            FROM study_materials
            WHERE student_id = %s
            ORDER BY uploaded_at DESC
            """,
            (1,)
        )
        rows = cursor.fetchall()
        cursor.close()
        materials = []
        for row in rows:
            materials.append({
                "id": row[0],
                "filename": row[1],
                "material_type": row[2],
                "total_pages": row[3],
                "uploaded_at": row[4].isoformat()
            })
        return {"materials": materials}
    finally:
        db.close()


@app.delete("/study-materials/{material_id}")
def delete_study_material(material_id: int):
    db = psycopg2.connect(
        dbname="campuspilot",
        user="chiranjeev",
        host="localhost"
    )
    try:
        cursor = db.cursor()
        cursor.execute(
            """
            DELETE FROM study_materials
            WHERE id = %s AND student_id = %s
            RETURNING id
            """,
            (material_id, 1)
        )
        deleted = cursor.fetchone()
        if deleted is None:
            cursor.close()
            raise HTTPException(
                status_code=404,
                detail="Study material not found."
            )
        db.commit()
        cursor.close()
        return {
            "message": "Study material deleted successfully.",
            "material_id": deleted[0]
        }
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete study material."
        )
    finally:
        db.close()
