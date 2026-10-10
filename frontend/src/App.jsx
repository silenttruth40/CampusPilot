import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  // -------------------- STATE --------------------

  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [chatSources, setChatSources] = useState([]);
  const [chatEvidence, setChatEvidence] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [tasks, setTasks] = useState([]);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("1");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskError, setTaskError] = useState("");
  const [studyPlan, setStudyPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);


  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(120);
  const [sessionMinutes, setSessionMinutes] = useState(40);
  const [studyDays, setStudyDays] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [preferencesLoading, setPreferencesLoading] = useState(false);

  const [studyMaterials, setStudyMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");

  const [selectedPdf, setSelectedPdf] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // -------------------- FETCH DATA --------------------
  useEffect(() => {
    const fetchStudyMaterials = async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/study-materials"
        );

        if (!response.ok) {
          throw new Error("Failed to load study materials.");
        }

        const data = await response.json();
        setStudyMaterials(data.materials || []);
      } catch (error) {
        setMaterialsError("Unable to load study materials.");
      } finally {
        setMaterialsLoading(false);
      }
    };

    fetchStudyMaterials();
  }, []);
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/preferences"
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error("Could not load preferences");
        }

        setDailyStudyMinutes(data.daily_study_minutes);
        setSessionMinutes(data.session_minutes);
        setStudyDays(data.study_days);
      } catch (error) {
        console.error("Error loading preferences:", error);
      }
    };

    loadPreferences();
  }, []);
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const result = await fetch(`${API_URL}/subjects`);

        if (!result.ok) {
          throw new Error("Unable to fetch subjects");
        }

        const data = await result.json();
        setSubjects(data.subjects ?? []);
      } catch (error) {
        console.error("Error fetching subjects:", error);
      }
    };

    fetchSubjects();
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const result = await fetch(`${API_URL}/tasks`);

        if (!result.ok) {
          throw new Error("Unable to fetch tasks");
        }

        const data = await result.json();
        setTasks(data.tasks ?? []);
      } catch (error) {
        console.error("Error fetching tasks:", error);
      }
    };

    fetchTasks();
  }, []);

  // -------------------- TASK STATISTICS --------------------

  const totalTasks = tasks.length;

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const pendingTasks = totalTasks - completedTasks;

  const completionPercentage =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100);

  // -------------------- DEADLINES --------------------

  const now = new Date();

  const todayString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const pendingTasksList = tasks.filter(
    (task) => !task.completed
  );

  const overdueTasks = pendingTasksList.filter(
    (task) => task.due_date && task.due_date < todayString
  );

  const dueTodayTasks = pendingTasksList.filter(
    (task) => task.due_date === todayString
  );

  const upcomingTasks = pendingTasksList.filter(
    (task) => task.due_date && task.due_date > todayString
  );

  // -------------------- SUBJECT-WISE PROGRESS --------------------

  const subjectProgress = subjects.map((subject) => {
    const subjectTasks = tasks.filter(
      (task) => task.subject === subject.name
    );

    const completed = subjectTasks.filter(
      (task) => task.completed
    ).length;

    const total = subjectTasks.length;

    return {
      ...subject,
      total,
      completed,
      pending: total - completed,
      percentage:
        total === 0
          ? 0
          : Math.round((completed / total) * 100),
    };
  });

  // -------------------- AI CHAT --------------------

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!message.trim()) return;

    try {
      const result = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.trim(),
        }),
      });

      if (!result.ok) {
        throw new Error("CampusPilot could not process your question.");
      }

      const data = await result.json();

      setResponse(data.reply);
      setChatSources(data.sources || []);
      setChatEvidence(data.evidence || []);
      setShowEvidence(false);
      setMessage("");
    } catch (error) {
      console.error("Error connecting to backend:", error);
      setChatSources([]);
      setChatEvidence([]);
      setResponse("Unable to connect to CampusPilot. Please try again.");
    }
  };

  // -------------------- ADD TASK --------------------

  const handleAddTask = async (e) => {
    e.preventDefault();
    setTaskError("");

    if (!taskTitle.trim()) {
      setTaskError("Please enter a task title.");
      return;
    }

    try {
      const result = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: 1,
          subject_id: taskSubject ? Number(taskSubject) : null,
          title: taskTitle.trim(),
          due_date: taskDueDate || null,
        }),
      });

      if (!result.ok) {
        throw new Error("Unable to add task. Check the task details.");
      }

      const newTask = await result.json();

      const selectedSubject = subjects.find(
        (subject) => subject.id === newTask.subject_id
      );

      setTasks((currentTasks) => [
        ...currentTasks,
        {
          ...newTask,
          subject: selectedSubject
            ? selectedSubject.name
            : null,
        },
      ]);

      setTaskTitle("");
      setTaskDueDate("");
      setTaskSubject("1");
    } catch (error) {
      console.error("Error adding task:", error);
      setTaskError(error.message);
    }
  };

  // -------------------- COMPLETE TASK --------------------

  const handleCompleteTask = async (taskId) => {
    try {
      const result = await fetch(
        `${API_URL}/tasks/${taskId}/complete`,
        { method: "PATCH" }
      );

      if (!result.ok) {
        throw new Error("Unable to complete task.");
      }

      const data = await result.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === taskId
            ? { ...task, completed: true }
            : task
        )
      );
    } catch (error) {
      console.error("Error completing task:", error);
      setTaskError(error.message);
    }
  };
  // -------------------- Generate Plan --------------------
    const handleGeneratePlan = async () => {
    setPlanLoading(true);
    setStudyPlan("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/study-plan"
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to generate study plan");
      }

      setStudyPlan(data.study_plan);
    } catch (error) {
      setStudyPlan("Could not generate a study plan. Please check that the backend is running and try again.");
    } finally {
      setPlanLoading(false);
    }
  };

  // -------------------- upload pdf --------------------
    const handlePdfUpload = async (event) => {
      event.preventDefault();

      if (!selectedPdf) {
        setUploadMessage("Please select a PDF first.");
        return;
      }

      setUploadingPdf(true);
      setUploadMessage("");

      try {
        const formData = new FormData();
        formData.append("file", selectedPdf);

        const response = await fetch(
          "http://127.0.0.1:8000/upload-syllabus",
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "PDF upload failed.");
        }

        setUploadMessage("PDF uploaded successfully!");
        setSelectedPdf(null);

        event.target.reset();

        const materialsResponse = await fetch(
          "http://127.0.0.1:8000/study-materials"
        );

        if (materialsResponse.ok) {
          const materialsData = await materialsResponse.json();
          setStudyMaterials(materialsData.materials || []);
        }
      } catch (error) {
        setUploadMessage(error.message || "Unable to upload PDF.");
      } finally {
        setUploadingPdf(false);
      }
    };

  // -------------------- delete pdf --------------------
    const handleDeleteMaterial = async (materialId, filename) => {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${filename}"?`
      );

      if (!confirmed) return;

      try {
        const response = await fetch(
          `http://127.0.0.1:8000/study-materials/${materialId}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Failed to delete PDF.");
        }

        setStudyMaterials((previousMaterials) =>
          previousMaterials.filter(
            (material) => material.id !== materialId
          )
        );

        setUploadMessage("Study material deleted successfully!");
      } catch (error) {
        setUploadMessage(
          error.message || "Unable to delete study material."
        );
      }
    };
  // -------------------- Generate Plan --------------------
    const handleSavePreferences = async () => {
      setPreferencesLoading(true);
      setPreferencesMessage("");

      try {
        const response = await fetch(
          "http://127.0.0.1:8000/preferences",
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              student_id: 1,
              daily_study_minutes: Number(dailyStudyMinutes),
              session_minutes: Number(sessionMinutes),
              study_days: studyDays,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || "Could not save preferences");
        }

        setPreferencesMessage("Preferences saved successfully!");
      } catch (error) {
        setPreferencesMessage(error.message);
      } finally {
        setPreferencesLoading(false);
      }
    };

    const handleStudyDayChange = (day) => {
      setStudyDays((previousDays) =>
        previousDays.includes(day)
          ? previousDays.filter((item) => item !== day)
          : [...previousDays, day].sort((a, b) => a - b)
      );
    };
  // -------------------- UI --------------------

  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">🎓 CampusPilot</div>

        <div className="nav-links">
          <span>Dashboard</span>
          <span>Subjects</span>
          <span>Study Plan</span>
          <span>Progress</span>
        </div>
      </nav>

      <main className="main-content">
        {/* HERO */}

        <section className="hero">
          <p className="welcome">WELCOME TO CAMPUSPILOT</p>

          <h1>
            Your AI College
            <br />
            <span>Assistant</span>
          </h1>

          <p className="description">
            Study smarter with an AI assistant that understands your
            subjects, tracks your progress, and helps you reach your goals.
          </p>
        </section>

        {/* AI CHAT */}

        <section
          className={`chat-card ${response ? "chat-expanded" : ""}`}
        >
          <div className="ai-icon">✦</div>

          <div>
            <h2>How can I help you today?</h2>
            <p>
              Ask me about your subjects, study plans, exams, or anything
              related to your academics.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="chat-form">
            <input
              type="text"
              placeholder="Ask CampusPilot anything..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <button type="submit">Ask AI →</button>
          </form>

          
          
          {response && (
            <div className="ai-response">
              <strong>CampusPilot</strong>

              <div className="ai-response-text">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>

              {chatSources.length > 0 && (
                <div className="chat-sources">
                  <strong>Sources used</strong>

                  <ul>
                    {chatSources.map((source, index) => (
                      <li key={`${source}-${index}`}>
                        📄 {source}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {chatEvidence.length > 0 && (
            <div className="chat-evidence">
              <button
                type="button"
                className="evidence-toggle"
                onClick={() => setShowEvidence(!showEvidence)}
              >
                {showEvidence ? "Hide full evidence ▲" : "Show full evidence ▼"}
                <span>{chatEvidence.length} passages</span>
              </button>

              {showEvidence && (
                <div className="evidence-list">
                  {chatEvidence.map((item) => (
                    <div
                      className="evidence-item"
                      key={item.chunk_id}
                    >
                      <div className="evidence-filename">
                        📄 {item.filename} · Chunk {item.chunk_id}
                      </div>
                      <p>{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}



        </section>

        {/* SUBJECTS */}

        <section className="subjects-section">
          <h2>My Subjects</h2>

          <div className="subjects-grid">
            {subjects.map((subject) => (
              <div className="subject-card" key={subject.id}>
                <h3>{subject.name}</h3>
                <p>{subject.code}</p>
              </div>
            ))}
          </div>
        </section>

        {/* STUDY MATERIAL */}

        <section className="study-materials-section">
          <h2>Study Materials</h2>


          <form onSubmit={handlePdfUpload} className="pdf-upload-form">
            <label htmlFor="syllabus-pdf">
              Select a PDF syllabus or study material
            </label>

            <input
              id="syllabus-pdf"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => setSelectedPdf(event.target.files?.[0] || null)}
            />

            <button type="submit" disabled={uploadingPdf || !selectedPdf}>
              {uploadingPdf ? "Uploading..." : "Add PDF"}
            </button>

            {uploadMessage && <p role="status">{uploadMessage}</p>}
          </form>

          {materialsLoading && <p>Loading study materials...</p>}

          {materialsError && <p>{materialsError}</p>}

          {!materialsLoading &&
            !materialsError &&
            studyMaterials.length === 0 && (
              <p>No study materials uploaded yet.</p>
            )}

          
          {!materialsLoading &&
            studyMaterials.map((material) => (
              <div className="material-card" key={material.id}>
                <div className="material-info">
                  <h3>{material.filename}</h3>
                  <p>Type: {material.material_type}</p>
                  <p>Pages: {material.total_pages}</p>
                </div>

                <button
                  type="button"
                  className="delete-material-btn"
                  onClick={() =>
                    handleDeleteMaterial(material.id, material.filename)
                  }
                >
                  Delete
                </button>
              </div>
            ))}
        </section>

        {/* DASHBOARD */}

        <section className="dashboard-section">
          <div className="dashboard-heading">
            <div>
              <h2>Your Study Overview</h2>
              <p>Track your academic progress at a glance.</p>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <p>Total Tasks</p>
              <h3>{totalTasks}</h3>
            </div>

            <div className="stat-card">
              <p>Completed</p>
              <h3>{completedTasks}</h3>
            </div>

            <div className="stat-card">
              <p>Pending</p>
              <h3>{pendingTasks}</h3>
            </div>

            <div className="stat-card">
              <p>Overall Progress</p>
              <h3>{completionPercentage}%</h3>
            </div>
          </div>

          <div className="progress-card">
            <div className="progress-label">
              <span>Study progress</span>
              <span>{completionPercentage}%</span>
            </div>

            <div
              className="progress-track"
              role="progressbar"
              aria-label="Study task completion"
              aria-valuenow={completionPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-fill"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </section>

        {/* DEADLINES */}

        <section className="deadlines-section">
          <h2>Upcoming Deadlines</h2>

          <p className="section-description">
            Focus on the tasks that need your attention.
          </p>

          <div className="deadline-groups">
            <div className="deadline-card overdue-card">
              <h3>Overdue ({overdueTasks.length})</h3>

              {overdueTasks.length === 0 ? (
                <p>You're all caught up!</p>
              ) : (
                overdueTasks.map((task) => (
                  <div className="deadline-item" key={task.id}>
                    <strong>{task.title}</strong>
                    <span>Due: {task.due_date}</span>
                  </div>
                ))
              )}
            </div>

            <div className="deadline-card today-card">
              <h3>Due Today ({dueTodayTasks.length})</h3>

              {dueTodayTasks.length === 0 ? (
                <p>No tasks due today.</p>
              ) : (
                dueTodayTasks.map((task) => (
                  <div className="deadline-item" key={task.id}>
                    <strong>{task.title}</strong>
                    <span>
                      Subject: {task.subject || "General"}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="deadline-card upcoming-card">
              <h3>Upcoming ({upcomingTasks.length})</h3>

              {upcomingTasks.length === 0 ? (
                <p>No upcoming deadlines.</p>
              ) : (
                upcomingTasks.map((task) => (
                  <div className="deadline-item" key={task.id}>
                    <strong>{task.title}</strong>
                    <span>Due: {task.due_date}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* SUBJECT-WISE PROGRESS */}

        <section className="subject-progress-section">
          <h2>Subject-wise Progress</h2>

          <p className="section-description">
            See how you're progressing across your subjects.
          </p>

          <div className="subject-progress-grid">
            {subjectProgress.map((subject) => (
              <div className="subject-progress-card" key={subject.id}>
                <div className="subject-progress-heading">
                  <div>
                    <h3>{subject.name}</h3>
                    <p>{subject.code}</p>
                  </div>

                  <span>{subject.percentage}%</span>
                </div>

                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`${subject.name} task completion`}
                  aria-valuenow={subject.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="progress-fill"
                    style={{ width: `${subject.percentage}%` }}
                  />
                </div>

                <div className="subject-progress-stats">
                  <span>Total: {subject.total}</span>
                  <span>Done: {subject.completed}</span>
                  <span>Pending: {subject.pending}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* preference selection */}
        <section className="preferences-section">
          <h2>Study Preferences</h2>
          <p>Customize your schedule around your daily routine.</p>

          <div className="preferences-fields">
            <label>
              Daily study time: {Math.floor(dailyStudyMinutes / 60)}h{" "}
              {dailyStudyMinutes % 60}m
              <input
                type="range"
                min="30"
                max="720"
                step="15"
                value={dailyStudyMinutes}
                onChange={(event) =>
                  setDailyStudyMinutes(Number(event.target.value))
                }
              />
            </label>

            <label>
              Preferred session length: {sessionMinutes} minutes
              <input
                type="range"
                min="15"
                max="180"
                step="15"
                value={sessionMinutes}
                onChange={(event) =>
                  setSessionMinutes(Number(event.target.value))
                }
              />
            </label>
          </div>

          <h3>Study days</h3>
          <div className="study-days">
            {[
              { id: 1, label: "Mon" },
              { id: 2, label: "Tue" },
              { id: 3, label: "Wed" },
              { id: 4, label: "Thu" },
              { id: 5, label: "Fri" },
              { id: 6, label: "Sat" },
              { id: 7, label: "Sun" },
            ].map((day) => (
              <label key={day.id} className="study-day-option">
                <input
                  type="checkbox"
                  checked={studyDays.includes(day.id)}
                  onChange={() => handleStudyDayChange(day.id)}
                />
                {day.label}
              </label>
            ))}
          </div>

          <button
            onClick={handleSavePreferences}
            disabled={preferencesLoading || studyDays.length === 0}
          >
            {preferencesLoading ? "Saving..." : "Save Preferences"}
          </button>

          {preferencesMessage && (
            <p role="status">{preferencesMessage}</p>
          )}
        </section>
        {/* STUDY PLANNER */}
        <section className="study-planner-section">
          <h2>AI Study Planner</h2>
          <p>
            Generate a personalized study schedule using your pending
            tasks and deadlines.
          </p>

          <button
            onClick={handleGeneratePlan}
            disabled={planLoading}
          >
            {planLoading ? "Creating your plan..." : "Generate Study Plan"}
          </button>

          {studyPlan && (
            <div className="study-plan-result">
              <h3>Your Personalized Study Plan</h3>
              <div className="study-plan-text">
                <ReactMarkdown>{studyPlan}</ReactMarkdown>
              </div>
            </div>
          )}
        </section>

        {/* ADD TASK */}

        <section className="add-task-section">
          <h2>Add a Study Task</h2>

          <form onSubmit={handleAddTask} className="add-task-form">
            <input
              type="text"
              placeholder="Enter task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              required
            />

            <select
              value={taskSubject}
              onChange={(e) => setTaskSubject(e.target.value)}
            >
              <option value="">General task</option>

              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
            />

            <button type="submit">Add Task</button>
          </form>

          {taskError && (
            <p className="task-error">{taskError}</p>
          )}
        </section>

        {/* MY STUDY TASKS */}

        <section className="tasks-section">
          <h2>My Study Tasks</h2>

          {tasks.length === 0 ? (
            <p>No study tasks found.</p>
          ) : (
            <div className="tasks-grid">
              {tasks.map((task) => (
                <div className="task-card" key={task.id}>
                  <h3>{task.title}</h3>

                  <p>
                    Subject: {task.subject || "General"}
                  </p>

                  <p>
                    Due date: {task.due_date || "No deadline"}
                  </p>

                  <p>
                    Status: {task.completed ? "Completed" : "Pending"}
                  </p>

                  {!task.completed && (
                    <button
                      type="button"
                      onClick={() => handleCompleteTask(task.id)}
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FEATURES */}

        <section className="features">
          <div className="feature-card">
            <div className="feature-icon">📚</div>
            <h3>AI Tutor</h3>
            <p>Get explanations based on your study material.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3>Smart Planning</h3>
            <p>Create personalized study plans around your exams.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Track Progress</h3>
            <p>Monitor your learning and identify weak topics.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;