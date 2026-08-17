import React, { useState, useRef, ChangeEvent, ReactNode } from "react";
import { useForm, FieldError } from "react-hook-form";
import {
  Mail,
  Lock,
  User,
  Calendar,
  ImagePlus,
  AtSign,
  MessageSquare,
  Eye,
  EyeOff,
  Loader2,
  X,
} from "lucide-react";
import { assets } from "../../../public/assets";

const BRAND = "#0b1f3a";

interface SignInFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dob: string;
  nickname?: string;
  aboutMe?: string;
  avatar?: File | null;
}

export default function SignIn() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    mode: "onBlur",
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      dob: "",
      nickname: "",
      aboutMe: "",
      avatar: null,
    },
  });

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aboutMeValue = watch("aboutMe") || "";

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValue("avatar", file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearAvatar = () => {
    setValue("avatar", null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (data: SignInFormData) => {
    await new Promise((r) => setTimeout(r, 900));
    console.log("Sign up payload:", data);
    alert("Account created (check console for payload).");
  };

  return (
    <div
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#FAFAFA] flex items-center justify-center p-6"
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={assets.favicon.src} alt="" className='h-16 object-contain' />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-7 py-8">
          <h1 className="text-[19px] font-semibold text-gray-900 text-center">
            Create your account
          </h1>
          <p className="text-[13px] text-gray-500 text-center mt-1 mb-6">
            Welcome! Please fill in the details to get started.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center mb-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden hover:border-[#6C47FF] transition-colors"
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImagePlus size={20} className="text-gray-400" />
                  )}
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={clearAvatar}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <span className="text-[12px] text-gray-400 mt-2">
                Avatar <span className="text-gray-300">(optional)</span>
              </span>
            </div>

            {/* First / Last name */}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                error={errors.firstName}
                icon={<User size={15} />}
              >
                <input
                  type="text"
                  placeholder="Jane"
                  className={inputClass(errors.firstName)}
                  {...register("firstName", { required: "Required" })}
                />
              </Field>
              <Field
                label="Last name"
                error={errors.lastName}
                icon={<User size={15} />}
              >
                <input
                  type="text"
                  placeholder="Doe"
                  className={inputClass(errors.lastName)}
                  {...register("lastName", { required: "Required" })}
                />
              </Field>
            </div>

            {/* Email */}
            <Field label="Email address" error={errors.email} icon={<Mail size={15} />}>
              <input
                type="email"
                placeholder="jane@example.com"
                className={inputClass(errors.email)}
                {...register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Enter a valid email address",
                  },
                })}
              />
            </Field>

            {/* Password */}
            <Field label="Password" error={errors.password} icon={<Lock size={15} />}>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className={inputClass(errors.password) + " pr-9"}
                  {...register("password", {
                    required: "Password is required",
                    minLength: {
                      value: 8,
                      message: "Must be at least 8 characters",
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            {/* Date of birth */}
            <Field label="Date of birth" error={errors.dob} icon={<Calendar size={15} />}>
              <input
                type="date"
                className={inputClass(errors.dob)}
                {...register("dob", {
                  required: "Date of birth is required",
                  validate: (v) =>
                    new Date(v) <= new Date() || "Date can't be in the future",
                })}
              />
            </Field>

            {/* Nickname (optional) */}
            <Field
              label="Nickname"
              optional
              error={errors.nickname}
              icon={<AtSign size={15} />}
            >
              <input
                type="text"
                placeholder="janed"
                className={inputClass(errors.nickname)}
                {...register("nickname", {
                  maxLength: { value: 30, message: "Max 30 characters" },
                })}
              />
            </Field>

            {/* About me (optional) */}
            <Field
              label="About me"
              optional
              error={errors.aboutMe}
              icon={<MessageSquare size={15} />}
            >
              <textarea
                placeholder="A short bio..."
                rows={3}
                className={inputClass(errors.aboutMe) + " resize-none"}
                {...register("aboutMe", {
                  maxLength: { value: 280, message: "Max 280 characters" },
                })}
              />
              <div className="text-right text-[11px] text-gray-300 mt-1">
                {aboutMeValue.length}/280
              </div>
            </Field>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 rounded-lg text-white text-[14px] font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-70 mt-1"
              style={{ backgroundColor:  BRAND}}
            >
              {isSubmitting && <Loader2 size={15} className="animate-spin" />}
              {isSubmitting ? "Creating account..." : "Continue"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-gray-500 mt-5">
          Already have an account?{" "}
          <button type="button" className="font-medium" style={{ color: BRAND }}>
            Sign in
          </button>
        </p>

        <p className="text-center text-[11px] text-gray-300 mt-6">
          Secured by <span className="font-semibold text-gray-400">Social Network</span>
        </p>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: FieldError;
  icon: ReactNode;
  optional?: boolean;
  children: ReactNode;
}

function Field({ label, error, icon, optional, children }: FieldProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-medium text-gray-700 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {optional && <span className="text-[11px] text-gray-300">optional</span>}
      </span>
      {children}
      {error && (
        <span className="block text-[11.5px] text-red-500 mt-1">
          {error.message}
        </span>
      )}
    </label>
  );
}

function inputClass(error?: FieldError): string {
  return [
    "w-full h-9 px-3 rounded-lg border text-[13.5px] text-gray-900 placeholder-gray-300",
    "outline-none transition-shadow bg-white",
    "focus:ring-2 focus:ring-offset-0",
    error
      ? "border-red-300 focus:ring-red-100"
      : "border-gray-200 focus:border-[#6C47FF] focus:ring-[#6C47FF1A]",
  ].join(" ");
}