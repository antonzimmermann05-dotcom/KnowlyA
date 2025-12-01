import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useFileUploadMutation } from "@/hooks/use-file-upload";
import { useGPTChatMutation } from "@/hooks/use-gpt-chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  BookOpen,
  Brain,
  GraduationCap,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Edit3,
  ArrowUpDown,
  RefreshCw,
  BarChart3,
  Crown,
  LogOut,
  User
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { MathText } from "@/components/MathText";
import { AuthDialog, getCurrentUser, logoutUser, updateUserPremiumStatus, type UserData } from "@/components/AuthDialog";

export const Route = createFileRoute("/")({
  component: App,
});

// Set up PDF.js worker - use local bundled worker instead of CDN
// Vite will handle bundling the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// Types for learning content
type LessonLength = "short" | "normal" | "long";

interface MicroLesson {
  title: string;
  content: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

interface Flashcard {
  front: string;
  back: string;
}

interface LearningContent {
  microLessons: MicroLesson[];
  quizQuestions: QuizQuestion[];
  summary: string;
  flashcards: Flashcard[];
  detectedLanguage: string;
}

interface QuizResult {
  timestamp: Date;
  totalQuestions: number;
  correctAnswers: number;
  percentage: number;
}

interface UploadedMaterial {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  uploadedAt: Date;
  extractedText: string;
  detectedLanguage?: string;
  suggestedTitle?: string;
  thematicCategory?: string;
  content?: LearningContent;
  processingStatus: "pending" | "processing" | "completed" | "error";
  error?: string;
  quizResults?: QuizResult[];
}

interface SubscriptionStatus {
  isPremium: boolean;
  subscribedAt?: Date;
}

const STORAGE_KEY = "learning-materials";
const SUBSCRIPTION_KEY = "subscription-status";
const UPLOAD_LIMIT_KEY = "upload-limits";
const FREE_DAILY_LIMIT = 3;

function App() {
  const [materials, setMaterials] = useState<UploadedMaterial[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<UploadedMaterial | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [lessonLength, setLessonLength] = useState<LessonLength>("normal");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number | null>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [sortBy, setSortBy] = useState<"date" | "theme" | "name">("date");
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [showResultsChart, setShowResultsChart] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus>({ isPremium: false });
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [todayUploadCount, setTodayUploadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const uploadMutation = useFileUploadMutation();
  const chatMutation = useGPTChatMutation();

  // Load materials from localStorage on mount
  useEffect(() => {
    // Load current user
    const user = getCurrentUser();
    setCurrentUser(user);

    // Sync subscription status with user data
    if (user) {
      setSubscription({ isPremium: user.isPremium });
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMaterials(parsed.map((m: UploadedMaterial) => ({
          ...m,
          uploadedAt: new Date(m.uploadedAt),
          quizResults: m.quizResults?.map((r) => ({
            ...r,
            timestamp: new Date(r.timestamp),
          })),
        })));
      } catch (e) {
        console.error("Failed to load materials:", e);
      }
    }

    // Load subscription status (fallback for backward compatibility)
    const storedSub = localStorage.getItem(SUBSCRIPTION_KEY);
    if (storedSub && !user) {
      try {
        const parsed = JSON.parse(storedSub);
        setSubscription({
          ...parsed,
          subscribedAt: parsed.subscribedAt ? new Date(parsed.subscribedAt) : undefined,
        });
      } catch (e) {
        console.error("Failed to load subscription:", e);
      }
    }

    // Load today's upload count
    const storedLimits = localStorage.getItem(UPLOAD_LIMIT_KEY);
    if (storedLimits) {
      try {
        const parsed = JSON.parse(storedLimits);
        const today = new Date().toDateString();
        if (parsed.date === today) {
          setTodayUploadCount(parsed.count || 0);
        } else {
          // Reset counter for new day
          localStorage.setItem(UPLOAD_LIMIT_KEY, JSON.stringify({ date: today, count: 0 }));
          setTodayUploadCount(0);
        }
      } catch (e) {
        console.error("Failed to load upload limits:", e);
      }
    }
  }, []);

  // Save materials to localStorage whenever they change
  useEffect(() => {
    if (materials.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
    }
  }, [materials]);

  // Save subscription status
  useEffect(() => {
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
  }, [subscription]);

  // Check if user can upload
  const canUpload = () => {
    // Premium users (logged in with premium) have unlimited uploads
    if (currentUser?.isPremium || subscription.isPremium) return true;
    // Free users (logged in or anonymous) have daily limit
    return todayUploadCount < FREE_DAILY_LIMIT;
  };

  // Update upload count
  const incrementUploadCount = () => {
    const today = new Date().toDateString();
    const newCount = todayUploadCount + 1;
    setTodayUploadCount(newCount);
    localStorage.setItem(UPLOAD_LIMIT_KEY, JSON.stringify({ date: today, count: newCount }));
  };

  // Open Stripe payment link
  const openStripePayment = () => {
    window.open('https://buy.stripe.com/7sYfZa92IgDK2AAdg6aIM00', '_blank');
  };

  // Handle successful authentication
  const handleAuthSuccess = (userData: UserData) => {
    setCurrentUser(userData);
    setSubscription({ isPremium: userData.isPremium });
    localStorage.setItem("knowly-current-user", userData.email);
  };

  // Handle logout
  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setSubscription({ isPremium: false });
  };

  // Handle premium upgrade
  const handlePremiumUpgrade = () => {
    if (currentUser) {
      updateUserPremiumStatus(currentUser.email, true);
      setCurrentUser({ ...currentUser, isPremium: true });
      setSubscription({ isPremium: true });
    }
  };

  // Extract text from PDF
  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if ('str' in item) {
            return item.str || "";
          }
          return "";
        })
        .join(" ");
      fullText += pageText + "\n\n";
    }

    return fullText.trim();
  };

  // Extract text from plain text file
  const extractTextFromFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || "");
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  // Extract text from PPT (simplified - just read as text)
  const extractTextFromPPT = async (file: File): Promise<string> => {
    // For PPT files, we'll just read them as text
    // In production, you'd use a library like pptx or mammoth
    return extractTextFromFile(file);
  };

  // Transcribe audio/video using GPT (simulated)
  const transcribeMedia = async (fileUrl: string, fileName: string): Promise<string> => {
    // In a real implementation, you'd use a transcription API like Whisper
    // For now, we'll simulate this by returning a placeholder
    return `[Transcription of ${fileName}]\n\nThis is a simulated transcription. In production, this would use a speech-to-text API like OpenAI Whisper to transcribe the audio/video content.`;
  };

  // Detect language from text
  const detectLanguage = async (text: string): Promise<string> => {
    const response = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: "You are a language detection expert. Detect the language of the provided text and return ONLY the language name in English (e.g., 'English', 'German', 'Spanish', 'French', etc.). Return just the language name, nothing else.",
        },
        {
          role: "user",
          content: `Detect the language of this text:\n\n${text.slice(0, 1000)}`,
        },
      ],
    });
    return response.content.trim();
  };

  // Generate suggested title based on content
  const generateSuggestedTitle = async (text: string, language: string): Promise<string> => {
    const response = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are a content analyst. Analyze the provided text and generate a short, descriptive title (3-8 words) that captures the main topic or subject. Respond ONLY with the title in ${language}, nothing else.`,
        },
        {
          role: "user",
          content: `Generate a title for this content:\n\n${text.slice(0, 2000)}`,
        },
      ],
    });
    return response.content.trim();
  };

  // Categorize content thematically
  const categorizeContent = async (text: string, language: string): Promise<string> => {
    const response = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are a content categorization expert. Analyze the provided text and assign it to ONE thematic category. Choose from: Science, Technology, History, Literature, Mathematics, Business, Arts, Health, Language, Social Studies, Philosophy, Engineering, or Other. Respond ONLY with the category name in ${language}, nothing else.`,
        },
        {
          role: "user",
          content: `Categorize this content:\n\n${text.slice(0, 2000)}`,
        },
      ],
    });
    return response.content.trim();
  };

  // Generate learning content using AI
  const generateLearningContent = async (extractedText: string, lessonLength: LessonLength = "normal"): Promise<LearningContent> => {
    setProcessingProgress(10);

    // Detect language first
    const detectedLanguage = await detectLanguage(extractedText);

    setProcessingProgress(25);

    // Determine lesson count and detail level based on length
    const lessonConfig = {
      short: { count: "2-3", detail: "brief and concise, focusing only on key points" },
      normal: { count: "4-5", detail: "moderate detail with clear explanations" },
      long: { count: "6-8", detail: "comprehensive and detailed with examples and in-depth explanations" },
    };

    const config = lessonConfig[lessonLength];

    // Generate micro-lessons
    const lessonsResponse = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are an educational content creator. Create ${config.count} ${config.detail} micro-lessons from the provided text. You MUST respond in ${detectedLanguage}. Return ONLY valid JSON in this exact format: {\"lessons\": [{\"title\": \"...\", \"content\": \"...\"}]}`,
        },
        {
          role: "user",
          content: `Create micro-lessons from this text:\n\n${extractedText.slice(0, 4000)}`,
        },
      ],
    });

    setProcessingProgress(40);

    // Generate quiz questions
    const quizResponse = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are a quiz creator. Create 5-7 detailed multiple-choice questions with 4 options each. Include an explanation for each correct answer. You MUST respond in ${detectedLanguage}. Return ONLY valid JSON in this exact format: {\"questions\": [{\"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correctAnswer\": 0, \"explanation\": \"...\"}]}`,
        },
        {
          role: "user",
          content: `Create quiz questions from this text:\n\n${extractedText.slice(0, 4000)}`,
        },
      ],
    });

    setProcessingProgress(60);

    // Generate summary
    const summaryResponse = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are a summarization expert. Create a concise 2-3 paragraph summary. You MUST respond in ${detectedLanguage}.`,
        },
        {
          role: "user",
          content: `Summarize this text:\n\n${extractedText.slice(0, 4000)}`,
        },
      ],
    });

    setProcessingProgress(80);

    // Generate flashcards
    const flashcardsResponse = await chatMutation.mutateAsync({
      messages: [
        {
          role: "system",
          content: `You are a flashcard creator. Create 10-12 detailed flashcards with a question/term on the front and a comprehensive answer/definition on the back. You MUST respond in ${detectedLanguage}. Return ONLY valid JSON in this exact format: {\"flashcards\": [{\"front\": \"...\", \"back\": \"...\"}]}`,
        },
        {
          role: "user",
          content: `Create flashcards from this text:\n\n${extractedText.slice(0, 4000)}`,
        },
      ],
    });

    setProcessingProgress(100);

    // Parse responses
    let microLessons: MicroLesson[] = [];
    let quizQuestions: QuizQuestion[] = [];
    let flashcards: Flashcard[] = [];

    try {
      const lessonsData = JSON.parse(lessonsResponse.content);
      microLessons = lessonsData.lessons || [];
    } catch (e) {
      // Fallback if JSON parsing fails
      microLessons = [{
        title: "Overview",
        content: lessonsResponse.content,
      }];
    }

    try {
      const quizData = JSON.parse(quizResponse.content);
      quizQuestions = quizData.questions || [];
    } catch (e) {
      quizQuestions = [];
    }

    try {
      const flashcardsData = JSON.parse(flashcardsResponse.content);
      flashcards = flashcardsData.flashcards || [];
    } catch (e) {
      flashcards = [];
    }

    return {
      microLessons,
      quizQuestions,
      summary: summaryResponse.content,
      flashcards,
      detectedLanguage,
    };
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if user is logged in (optional for free tier)
    // Free users can upload without account, but with daily limits
    const effectiveIsPremium = currentUser?.isPremium || false;

    // Check upload limit (only for non-premium users)
    if (!effectiveIsPremium && !canUpload()) {
      setShowSubscriptionDialog(true);
      event.target.value = ""; // Reset file input
      return;
    }

    // Validate file format
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    const isValidFormat =
      fileType === "application/pdf" ||
      fileType.includes("presentation") ||
      fileName.endsWith(".ppt") ||
      fileName.endsWith(".pptx") ||
      fileType.startsWith("text/") ||
      fileName.endsWith(".txt");

    if (!isValidFormat) {
      alert("Nur PDF, PPT und Text-Dateien sind erlaubt.");
      event.target.value = ""; // Reset file input
      return;
    }

    const materialId = `${Date.now()}-${Math.random()}`;
    const actualFileType = file.type || file.name.split(".").pop() || "unknown";

    // Create initial material entry
    const newMaterial: UploadedMaterial = {
      id: materialId,
      fileName: file.name,
      fileType: actualFileType,
      fileUrl: "",
      uploadedAt: new Date(),
      extractedText: "",
      processingStatus: "pending",
    };

    setMaterials((prev) => [...prev, newMaterial]);
    setSelectedMaterial(newMaterial);
    setProcessingProgress(0);

    // Increment upload count
    incrementUploadCount();

    try {
      // Upload file
      const uploadResult = await uploadMutation.mutateAsync({ file });

      // Update material with file URL
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId
            ? { ...m, fileUrl: uploadResult.fileUrl, processingStatus: "processing" }
            : m
        )
      );

      setProcessingProgress(10);

      // Extract text based on file type
      let extractedText = "";

      if (file.type === "application/pdf") {
        extractedText = await extractTextFromPDF(file);
      } else if (file.type.includes("presentation") || file.name.endsWith(".ppt") || file.name.endsWith(".pptx")) {
        extractedText = await extractTextFromPPT(file);
      } else if (file.type.startsWith("text/")) {
        extractedText = await extractTextFromFile(file);
      } else if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
        extractedText = await transcribeMedia(uploadResult.fileUrl, file.name);
      } else {
        extractedText = await extractTextFromFile(file);
      }

      setProcessingProgress(20);

      // Update material with extracted text
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId ? { ...m, extractedText } : m
        )
      );

      // Generate learning content
      const content = await generateLearningContent(extractedText, lessonLength);

      // Generate suggested title and category
      const suggestedTitle = await generateSuggestedTitle(extractedText, content.detectedLanguage);
      const thematicCategory = await categorizeContent(extractedText, content.detectedLanguage);

      // Store detected language, suggested title, and category
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId ? {
            ...m,
            detectedLanguage: content.detectedLanguage,
            suggestedTitle,
            thematicCategory
          } : m
        )
      );

      // Update material with generated content
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId
            ? { ...m, content, processingStatus: "completed" }
            : m
        )
      );

      setSelectedMaterial((prev) =>
        prev?.id === materialId ? { ...prev, content, processingStatus: "completed" } : prev
      );
    } catch (error) {
      console.error("Processing error:", error);
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId
            ? {
                ...m,
                processingStatus: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              }
            : m
        )
      );
    }
  };

  // Delete material
  const deleteMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    if (selectedMaterial?.id === id) {
      setSelectedMaterial(null);
    }
  };

  // Rename material
  const renameMaterial = (id: string, newName: string) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, fileName: newName } : m))
    );
    if (selectedMaterial?.id === id) {
      setSelectedMaterial((prev) => (prev ? { ...prev, fileName: newName } : null));
    }
    setEditingMaterialId(null);
    setEditingName("");
  };

  // Apply suggested title to material
  const applySuggestedTitle = (id: string) => {
    const material = materials.find((m) => m.id === id);
    if (material?.suggestedTitle) {
      const fileExtension = material.fileName.split('.').pop();
      const newName = `${material.suggestedTitle}.${fileExtension}`;
      renameMaterial(id, newName);
    }
  };

  // Sort materials
  const getSortedMaterials = () => {
    const sorted = [...materials];

    switch (sortBy) {
      case "theme":
        return sorted.sort((a, b) => {
          const categoryA = a.thematicCategory || "Other";
          const categoryB = b.thematicCategory || "Other";
          if (categoryA !== categoryB) {
            return categoryA.localeCompare(categoryB);
          }
          return b.uploadedAt.getTime() - a.uploadedAt.getTime();
        });
      case "name":
        return sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
      case "date":
      default:
        return sorted.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    }
  };

  // Save quiz results
  const saveQuizResult = () => {
    if (!selectedMaterial?.content?.quizQuestions) return;

    const totalQuestions = selectedMaterial.content.quizQuestions.length;
    let correctAnswers = 0;

    selectedMaterial.content.quizQuestions.forEach((quiz, idx) => {
      if (quizAnswers[idx] === quiz.correctAnswer) {
        correctAnswers++;
      }
    });

    const percentage = (correctAnswers / totalQuestions) * 100;

    const newResult: QuizResult = {
      timestamp: new Date(),
      totalQuestions,
      correctAnswers,
      percentage,
    };

    setMaterials((prev) =>
      prev.map((m) =>
        m.id === selectedMaterial.id
          ? { ...m, quizResults: [...(m.quizResults || []), newResult] }
          : m
      )
    );

    if (selectedMaterial) {
      setSelectedMaterial({
        ...selectedMaterial,
        quizResults: [...(selectedMaterial.quizResults || []), newResult],
      });
    }
  };

  // Check all answers at once
  const checkAllAnswers = () => {
    if (!selectedMaterial?.content?.quizQuestions) return;

    const allRevealed: Record<number, boolean> = {};
    selectedMaterial.content.quizQuestions.forEach((_, idx) => {
      allRevealed[idx] = true;
    });
    setRevealedAnswers(allRevealed);
    saveQuizResult();
  };

  // Generate new quiz questions
  const generateNewQuestions = async () => {
    if (!selectedMaterial?.extractedText || !selectedMaterial.detectedLanguage) return;

    setIsGeneratingQuestions(true);

    try {
      const quizResponse = await chatMutation.mutateAsync({
        messages: [
          {
            role: "system",
            content: `You are a quiz creator. Create 5-7 NEW and DIFFERENT detailed multiple-choice questions with 4 options each. Make sure these questions are different from any previous questions. Include an explanation for each correct answer. You MUST respond in ${selectedMaterial.detectedLanguage}. Return ONLY valid JSON in this exact format: {\"questions\": [{\"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correctAnswer\": 0, \"explanation\": \"...\"}]}`,
          },
          {
            role: "user",
            content: `Create NEW quiz questions from this text:\n\n${selectedMaterial.extractedText.slice(0, 4000)}`,
          },
        ],
      });

      let newQuestions: QuizQuestion[] = [];
      try {
        const quizData = JSON.parse(quizResponse.content);
        newQuestions = quizData.questions || [];
      } catch (e) {
        console.error("Failed to parse quiz questions:", e);
      }

      if (newQuestions.length > 0) {
        setMaterials((prev) =>
          prev.map((m) =>
            m.id === selectedMaterial.id && m.content
              ? {
                  ...m,
                  content: {
                    ...m.content,
                    quizQuestions: newQuestions,
                  },
                }
              : m
          )
        );

        if (selectedMaterial.content) {
          setSelectedMaterial({
            ...selectedMaterial,
            content: {
              ...selectedMaterial.content,
              quizQuestions: newQuestions,
            },
          });
        }

        // Reset quiz state
        setQuizAnswers({});
        setRevealedAnswers({});
      }
    } catch (error) {
      console.error("Failed to generate new questions:", error);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Reset quiz and flashcard state when material changes
  useEffect(() => {
    setQuizAnswers({});
    setRevealedAnswers({});
    setFlippedCards({});
    setShowResultsChart(false);
  }, [selectedMaterial?.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <GraduationCap className="h-12 w-12 text-blue-600" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Knowly
              </h1>
            </div>
            <div className="flex-1 flex justify-end items-center gap-2">
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {currentUser.email}
                    </div>
                    {currentUser.isPremium && (
                      <Badge className="text-xs bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                        <Crown className="h-3 w-3 mr-1" />
                        Premium
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    title="Abmelden"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowAuthDialog(true)}
                >
                  <User className="h-4 w-4 mr-2" />
                  Anmelden
                </Button>
              )}
            </div>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Upload your learning materials and let AI automatically generate
            micro-lessons, quizzes, summaries, and flashcards
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8 border-2 border-dashed border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Learning Material
                  {subscription.isPremium && (
                    <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Unterstützte Formate: PDF, PPT, Text
                </CardDescription>
              </div>
              {!subscription.isPremium && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSubscriptionDialog(true)}
                  className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Premium holen
                </Button>
              )}
            </div>
            {!subscription.isPremium && !currentUser?.isPremium && (
              <Alert className="mt-4 bg-yellow-50 border-yellow-200">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  {currentUser
                    ? `Gratis-Konto: ${todayUploadCount}/${FREE_DAILY_LIMIT} Dateien heute hochgeladen`
                    : `Gratis (ohne Konto): ${todayUploadCount}/${FREE_DAILY_LIMIT} Dateien heute hochgeladen`}
                  {todayUploadCount >= FREE_DAILY_LIMIT && " - Limit erreicht! Upgrade zu Premium für unbegrenzte Uploads."}
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 max-w-xs">
                  <Label htmlFor="lesson-length" className="text-sm font-medium mb-2 block">
                    Lesson Length
                  </Label>
                  <Select value={lessonLength} onValueChange={(value) => setLessonLength(value as LessonLength)}>
                    <SelectTrigger id="lesson-length">
                      <SelectValue placeholder="Select length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (2-3 lessons)</SelectItem>
                      <SelectItem value="normal">Normal (4-5 lessons)</SelectItem>
                      <SelectItem value="long">Long (6-8 lessons)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Button asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </span>
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf,.ppt,.pptx,.txt"
                    />
                  </label>
                </div>
              </div>
            </div>

            {(uploadMutation.isPending || chatMutation.isPending || processingProgress > 0) && processingProgress < 100 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-600">Processing your file...</span>
                </div>
                <Progress value={processingProgress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Materials Library */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Materials List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your Materials ({materials.length})
              </CardTitle>
              {materials.length > 0 && (
                <div className="mt-3">
                  <Label htmlFor="sort-by" className="text-sm font-medium mb-2 block">
                    Sort by
                  </Label>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as "date" | "theme" | "name")}>
                    <SelectTrigger id="sort-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">
                        <span className="flex items-center gap-2">
                          <ArrowUpDown className="h-3 w-3" />
                          Upload Date
                        </span>
                      </SelectItem>
                      <SelectItem value="theme">
                        <span className="flex items-center gap-2">
                          <ArrowUpDown className="h-3 w-3" />
                          Theme
                        </span>
                      </SelectItem>
                      <SelectItem value="name">
                        <span className="flex items-center gap-2">
                          <ArrowUpDown className="h-3 w-3" />
                          Name
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {materials.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No materials yet</p>
                    <p className="text-sm">Upload a file to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {getSortedMaterials().map((material) => (
                      <div
                        key={material.id}
                        className={`p-3 border rounded-lg transition-all ${
                          selectedMaterial?.id === material.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => setSelectedMaterial(material)}
                          >
                            {editingMaterialId === material.id ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      renameMaterial(material.id, editingName);
                                    } else if (e.key === "Escape") {
                                      setEditingMaterialId(null);
                                      setEditingName("");
                                    }
                                  }}
                                  className="text-sm"
                                  autoFocus
                                />
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => renameMaterial(material.id, editingName)}
                                    className="text-xs h-7 px-2"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingMaterialId(null);
                                      setEditingName("");
                                    }}
                                    className="text-xs h-7 px-2"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="font-medium text-sm break-words">
                                  {material.fileName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {material.uploadedAt.toLocaleDateString()}
                                </p>
                                {material.thematicCategory && (
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {material.thematicCategory}
                                  </Badge>
                                )}
                                {material.suggestedTitle && material.fileName !== `${material.suggestedTitle}.${material.fileName.split('.').pop()}` && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      applySuggestedTitle(material.id);
                                    }}
                                    className="text-xs h-7 px-2 mt-1 w-full text-blue-600"
                                  >
                                    Use suggested: {material.suggestedTitle}
                                  </Button>
                                )}
                              </>
                            )}
                            <div className="mt-1">
                              {material.processingStatus === "completed" && (
                                <Badge variant="default" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Ready
                                </Badge>
                              )}
                              {material.processingStatus === "processing" && (
                                <Badge variant="secondary" className="text-xs">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Processing
                                </Badge>
                              )}
                              {material.processingStatus === "error" && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Error
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {editingMaterialId !== material.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMaterialId(material.id);
                                  setEditingName(material.fileName);
                                }}
                                title="Rename"
                              >
                                <Edit3 className="h-4 w-4 text-blue-500" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMaterial(material.id);
                              }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Content Display */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Learning Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMaterial ? (
                <div className="text-center text-gray-500 py-12">
                  <Brain className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Select a material to view its content</p>
                </div>
              ) : selectedMaterial.processingStatus === "error" ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selectedMaterial.error || "Failed to process this file"}
                  </AlertDescription>
                </Alert>
              ) : selectedMaterial.processingStatus !== "completed" ? (
                <div className="text-center text-gray-500 py-12">
                  <Loader2 className="h-16 w-16 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Processing your material...</p>
                </div>
              ) : (
                <Tabs defaultValue="lessons" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="lessons">Lessons</TabsTrigger>
                    <TabsTrigger value="quiz">Quiz</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="flashcards" disabled={!subscription.isPremium}>
                      Flashcards
                      {!subscription.isPremium && (
                        <Crown className="h-3 w-3 ml-1 text-yellow-500" />
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="lessons" className="space-y-4">
                    <ScrollArea className="h-[450px]">
                      {selectedMaterial.content?.microLessons.map((lesson, idx) => (
                        <div key={idx} className="mb-4">
                          <h3 className="font-semibold text-lg mb-2">
                            <MathText text={`${idx + 1}. ${lesson.title}`} />
                          </h3>
                          <div className="text-gray-700 whitespace-pre-wrap">
                            <MathText text={lesson.content} />
                          </div>
                          {idx < (selectedMaterial.content?.microLessons.length || 0) - 1 && (
                            <Separator className="my-4" />
                          )}
                        </div>
                      ))}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="quiz" className="space-y-4">
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Button
                        onClick={checkAllAnswers}
                        variant="default"
                        size="sm"
                        disabled={Object.keys(quizAnswers).length === 0}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Check All Answers
                      </Button>
                      <Button
                        onClick={generateNewQuestions}
                        variant="outline"
                        size="sm"
                        disabled={isGeneratingQuestions}
                      >
                        {isGeneratingQuestions ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Generate New Questions
                      </Button>
                      {selectedMaterial.quizResults && selectedMaterial.quizResults.length > 0 && (
                        <Button
                          onClick={() => setShowResultsChart(!showResultsChart)}
                          variant="outline"
                          size="sm"
                        >
                          <BarChart3 className="h-4 w-4 mr-2" />
                          {showResultsChart ? "Hide" : "Show"} Results History
                        </Button>
                      )}
                    </div>

                    {showResultsChart && selectedMaterial.quizResults && selectedMaterial.quizResults.length > 0 && (
                      <Card className="mb-4 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                            Quiz Results History
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Track your learning progress over time
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {selectedMaterial.quizResults.map((result, idx) => {
                              const barWidth = result.percentage;
                              const color =
                                result.percentage >= 80 ? "bg-gradient-to-r from-green-500 to-green-600" :
                                result.percentage >= 60 ? "bg-gradient-to-r from-yellow-500 to-yellow-600" :
                                "bg-gradient-to-r from-red-500 to-red-600";
                              const textColor =
                                result.percentage >= 80 ? "text-green-700" :
                                result.percentage >= 60 ? "text-yellow-700" :
                                "text-red-700";

                              return (
                                <div key={idx} className="space-y-1.5 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-gray-600 font-medium flex items-center gap-1">
                                      <span className={`inline-block w-5 h-5 rounded-full ${textColor} bg-opacity-10 flex items-center justify-center text-xs font-bold`}>
                                        {idx + 1}
                                      </span>
                                      {new Date(result.timestamp).toLocaleString()}
                                    </span>
                                    <span className={`font-bold ${textColor}`}>
                                      {result.correctAnswers}/{result.totalQuestions}
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-8 relative overflow-hidden shadow-inner">
                                    <div
                                      className={`h-full ${color} rounded-full transition-all duration-500 ease-out flex items-center justify-between px-3`}
                                      style={{ width: `${barWidth}%` }}
                                    >
                                      {barWidth > 20 && (
                                        <span className="text-white text-sm font-bold drop-shadow">
                                          {result.percentage.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    {barWidth <= 20 && (
                                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold ${textColor}`}>
                                        {result.percentage.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <Separator className="my-4" />
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                              <div className="text-xs text-gray-500 mb-1">Average Score</div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-blue-600">
                                  {(selectedMaterial.quizResults.reduce((sum, r) => sum + r.percentage, 0) / selectedMaterial.quizResults.length).toFixed(1)}
                                </span>
                                <span className="text-sm text-gray-600">%</span>
                              </div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                              <div className="text-xs text-gray-500 mb-1">Best Score</div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-green-600">
                                  {Math.max(...selectedMaterial.quizResults.map(r => r.percentage)).toFixed(1)}
                                </span>
                                <span className="text-sm text-gray-600">%</span>
                              </div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                              <div className="text-xs text-gray-500 mb-1">Total Attempts</div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-purple-600">
                                  {selectedMaterial.quizResults.length}
                                </span>
                                <span className="text-sm text-gray-600">quiz{selectedMaterial.quizResults.length !== 1 ? 'zes' : ''}</span>
                              </div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                              <div className="text-xs text-gray-500 mb-1">Improvement</div>
                              <div className="flex items-baseline gap-1">
                                {(() => {
                                  const first = selectedMaterial.quizResults[0].percentage;
                                  const last = selectedMaterial.quizResults[selectedMaterial.quizResults.length - 1].percentage;
                                  const diff = last - first;
                                  return (
                                    <>
                                      <span className={`text-2xl font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                                      </span>
                                      <span className="text-sm text-gray-600">%</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <ScrollArea className="h-[450px]">
                      {selectedMaterial.content?.quizQuestions.map((quiz, idx) => {
                        const userAnswer = quizAnswers[idx];
                        const isRevealed = revealedAnswers[idx];
                        const isCorrect = userAnswer === quiz.correctAnswer;

                        return (
                          <div key={idx} className="mb-6">
                            <h3 className="font-semibold mb-3">
                              <MathText text={`${idx + 1}. ${quiz.question}`} />
                            </h3>
                            <div className="space-y-2">
                              {quiz.options.map((option, optIdx) => {
                                const isSelected = userAnswer === optIdx;
                                const isCorrectAnswer = optIdx === quiz.correctAnswer;

                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => {
                                      if (!isRevealed) {
                                        setQuizAnswers((prev) => ({ ...prev, [idx]: optIdx }));
                                      }
                                    }}
                                    disabled={isRevealed}
                                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                                      isRevealed && isCorrectAnswer
                                        ? "border-green-500 bg-green-50"
                                        : isRevealed && isSelected && !isCorrect
                                        ? "border-red-500 bg-red-50"
                                        : isSelected && !isRevealed
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 hover:border-gray-300"
                                    } ${isRevealed ? "cursor-not-allowed" : "cursor-pointer"}`}
                                  >
                                    <span className="font-medium mr-2">
                                      {String.fromCharCode(65 + optIdx)}.
                                    </span>
                                    <MathText text={option} />
                                    {isRevealed && isCorrectAnswer && (
                                      <Badge variant="default" className="ml-2 text-xs">
                                        Correct
                                      </Badge>
                                    )}
                                    {isRevealed && isSelected && !isCorrect && (
                                      <Badge variant="destructive" className="ml-2 text-xs">
                                        Wrong
                                      </Badge>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {userAnswer !== null && userAnswer !== undefined && !isRevealed && (
                              <Button
                                onClick={() => setRevealedAnswers((prev) => ({ ...prev, [idx]: true }))}
                                className="mt-3"
                                size="sm"
                              >
                                Check Answer
                              </Button>
                            )}
                            {isRevealed && quiz.explanation && (
                              <Alert className="mt-3 bg-blue-50 border-blue-200">
                                <AlertDescription>
                                  <strong>Explanation:</strong> <MathText text={quiz.explanation} />
                                </AlertDescription>
                              </Alert>
                            )}
                            {idx < (selectedMaterial.content?.quizQuestions.length || 0) - 1 && (
                              <Separator className="my-4" />
                            )}
                          </div>
                        );
                      })}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="summary">
                    <ScrollArea className="h-[450px]">
                      <div className="prose max-w-none">
                        <div className="text-gray-700 whitespace-pre-wrap">
                          <MathText text={selectedMaterial.content?.summary || ""} />
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="flashcards">
                    {!subscription.isPremium ? (
                      <div className="text-center py-12">
                        <Crown className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
                        <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
                        <p className="text-gray-600 mb-4">
                          Flashcards sind nur für Premium-Mitglieder verfügbar
                        </p>
                        <Button
                          onClick={() => setShowSubscriptionDialog(true)}
                          className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
                        >
                          <Crown className="h-4 w-4 mr-2" />
                          Jetzt Premium werden
                        </Button>
                      </div>
                    ) : (
                      <ScrollArea className="h-[450px]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedMaterial.content?.flashcards.map((card, idx) => {
                          const isFlipped = flippedCards[idx] || false;

                          return (
                            <Card
                              key={idx}
                              className="border-2 cursor-pointer transition-all hover:shadow-lg"
                              onClick={() => setFlippedCards((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                            >
                              <CardHeader>
                                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                                  <span className="text-blue-600">Flashcard {idx + 1}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {isFlipped ? "Back" : "Front"}
                                  </Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="min-h-[120px] flex flex-col justify-center">
                                {!isFlipped ? (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-2">Question:</p>
                                    <div className="font-medium text-lg">
                                      <MathText text={card.front} />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-4 italic">
                                      Click to reveal answer
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-2">Answer:</p>
                                    <div className="text-gray-700 text-base">
                                      <MathText text={card.back} />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-4 italic">
                                      Click to see question
                                    </p>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Offline Access Notice */}
        {materials.length > 0 && (
          <Alert className="mt-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              All your materials are saved locally and available offline. You can review them
              anytime, even without an internet connection.
            </AlertDescription>
          </Alert>
        )}

        {/* Subscription Dialog */}
        <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <Crown className="h-6 w-6 text-yellow-500" />
                Premium Upgrade
              </DialogTitle>
              <DialogDescription>
                Schalten Sie unbegrenzte Uploads und erweiterte Funktionen frei
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-lg border-2 border-yellow-200">
                <div className="text-center mb-4">
                  <div className="text-4xl font-bold text-gray-900">3,99€</div>
                  <div className="text-sm text-gray-600">pro Monat</div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Unbegrenzte Uploads</div>
                      <div className="text-sm text-gray-600">Laden Sie so viele Dateien hoch, wie Sie möchten</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Alle Dateiformate</div>
                      <div className="text-sm text-gray-600">PDF, PPT, Text und mehr</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Erweiterte KI-Funktionen</div>
                      <div className="text-sm text-gray-600">Bessere Quiz-Qualität und detailliertere Lektionen</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Flashcards Feature</div>
                      <div className="text-sm text-gray-600">Erstellen Sie Karteikarten für effizientes Lernen</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Prioritätssupport</div>
                      <div className="text-sm text-gray-600">Schnelle Hilfe bei Fragen</div>
                    </div>
                  </div>
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-sm">
                  {currentUser
                    ? `Kostenlos: ${FREE_DAILY_LIMIT} Uploads pro Tag. Upgrade jetzt für unbegrenzte Nutzung!`
                    : "Bitte melden Sie sich an, um Premium zu aktivieren"}
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSubscriptionDialog(false)}
                className="w-full sm:w-auto"
              >
                Später
              </Button>
              {currentUser ? (
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    onClick={openStripePayment}
                    className="w-full sm:w-auto bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Jetzt für 3,99€/Monat upgraden
                  </Button>
                  <Button
                    onClick={() => {
                      handlePremiumUpgrade();
                      setShowSubscriptionDialog(false);
                    }}
                    variant="outline"
                    className="w-full sm:w-auto text-xs"
                  >
                    Test: Premium aktivieren
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    setShowSubscriptionDialog(false);
                    setShowAuthDialog(true);
                  }}
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                >
                  <User className="h-4 w-4 mr-2" />
                  Zuerst anmelden
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Auth Dialog */}
        <AuthDialog
          open={showAuthDialog}
          onOpenChange={setShowAuthDialog}
          onAuthSuccess={handleAuthSuccess}
        />
      </div>
    </div>
  );
}
