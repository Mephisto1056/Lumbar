"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import { logoutUser } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

const UserMenuExpand = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserInfoOpen, setIsUserInfoOpen] = useState(false);
  const { user } = useAuthStore();

  return (
    <div className="fixed right-[2%] gap-3 h-8 flex items-center justify-between px-6 border-indigo-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-8 text-indigo-500 hover:text-indigo-600 cursor-pointer transform transition-transform duration-300  hover:scale-110"
        onClick={() => setIsUserInfoOpen((prev) => !prev)}
      >
        <path
          fillRule="evenodd"
          d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          clipRule="evenodd"
        />
      </svg>
      <div
        className="group flex flex-col gap-[4.5px] cursor-pointer transform transition-transform duration-300  hover:scale-110"
        onClick={() => setIsMenuOpen((prev) => !prev)}
      >
        <div
          className={`w-6 h-1 bg-indigo-500 group-hover:bg-indigo-600 rounded-xs ${
            isMenuOpen ? "rotate-45" : ""
          } origin-left ease-in-out duration-500`}
        />
        <div
          className={`w-6 h-1 bg-indigo-500 group-hover:bg-indigo-600 rounded-xs ${
            isMenuOpen ? "opacity-0" : ""
          } ease-in-out duration-500`}
        />
        <div
          className={`w-6 h-1 bg-indigo-500 group-hover:bg-indigo-600 rounded-xs ${
            isMenuOpen ? "-rotate-45" : ""
          } origin-left ease-in-out duration-500`}
        />
      </div>
      {isMenuOpen && (
        <div className="z-20 p-4 bg-white/100 shadow-2xl absolute right-0 top-10 flex flex-col items-center justify-center gap-2 rounded-3xl">
          <a
            href="https://mephisto1056.github.io/Lumbar/" // 配置页面的路由路径
            className="px-3 text-indigo-500 hover:text-indigo-700 flex items-center cursor-pointer"
            target="_blank" // 新窗口打开
            rel="noopener noreferrer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            Tutorial
          </a>

          <div
            className="cursor-pointer text-red-400 hover:text-red-600 flex items-center "
            onClick={logoutUser}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
            </svg>
            Log out
          </div>
        </div>
      )}
      {isUserInfoOpen && (
        <div className="z-20 p-4 bg-white/100 shadow-2xl absolute right-0 top-10 flex flex-col items-start justify-center gap-2 rounded-3xl">
          <div className="whitespace-nowrap px-3 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>

            {user?.name}
          </div>
          <div className="whitespace-nowrap px-3 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
            {user?.email}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenuExpand;
