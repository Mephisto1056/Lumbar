"use client";
import { useAuthStore } from "@/stores/authStore";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const Homepage = () => {
  const { user } = useAuthStore();
  const router = useRouter(); // 获取 router 实例
  const [userLoaded, setUserLoaded] = useState(false);

  useEffect(() => {
    // When the component mounts or user state changes, set userLoaded to true
    setUserLoaded(true);
  }, [user]);

  if (!userLoaded) {
    return null; // Optionally, you could return a loading indicator here
  }

  return (
    <div className="flex w-full h-screen items-center justify-center gap-[3%]">
      {/* 左侧内容区域 */}
      <div className="w-[85%] h-[85%] flex flex-col gap-8 items-center justify-center shadow-lg rounded-3xl">
        {/* logo */}
        <div className="w-[80%] h-[80%] flex items-center justify-center transform transition-transform duration-300  hover:scale-105">
          <Image
            src="/pictures/logo.png"
            alt="Image 1"
            width={250}
            height={250}
            className="object-cover rounded-3xl"
          />
        </div>
        {/* Li Website 标题 */}
        {/* <h1
          className={`text-5xl font-semibold text-transparent bg-clip-text bg-indigo-600 drop-shadow-lg mb-4`}
        >
          LAYRA
        </h1> */}

        {/* Welcome 副标题 */}
        <div className="w-full flex flex-col items-center justify-center gap-4">
          {/* <h2 className={`text-lg text-gray-900 mb-4`}>
            (<span className="text-indigo-600 font-bold">LAY</span>OUT-AWA
            <span className="text-indigo-600 font-bold">R</span>E{" "}
            <span className="text-indigo-600 font-bold">A</span>GENT)
          </h2> */}
          <h2
            className={` font-light text-xl text-gray-900 mb-4  transform transition-transform duration-300  hover:scale-110`}
          >
            A one-stop AI platform completely customized for GP business
          </h2>
          {/* "Agent Workflow Engine – Design, Automate, and Scale with AI-Driven Precision." */}
          <div className="w-full flex flex-col items-center justify-center gap-2 transform transition-transform duration-300  hover:scale-105">
            <h2 className={`text-gray-500`}>
               Based on the excellent GP historical business accumulation, AI helps us to provide more accurate and excellent auxiliary work
            </h2>
            <h2 className={`text text-gray-700`}>
              — page by page, structure and all.
            </h2>
          </div>
        </div>

        {/* 登录按钮 */}

        {user === null ? (
          <div
            onClick={() => {
              router.push("/sign-in");
            }}
            className={`text-lg bg-indigo-500 hover:bg-indigo-600 text-white py-2 pl-5 pr-4 rounded-full cursor-pointer flex items-center justify-center transform transition-transform duration-300  hover:scale-110`}
          >
            <div>Join us</div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-5 flex items-center justify-center"
            >
              <path
                fillRule="evenodd"
                d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-[5%] w-[50%]  transform transition-transform duration-300  hover:scale-110">
            <div
              onClick={() => {
                window.location.href = "/ai-chat";
                {
                  /*router.push("/chem-ketcher");*/
                }
              }}
              className={`text-lg bg-indigo-500 hover:bg-indigo-600 text-white py-2 pl-5 pr-4 rounded-full cursor-pointer flex items-center justify-center`}
            >
              <div>Start now</div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-5 flex items-center justify-center"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        )}

        <div className="flex-col items-center justify-center font-light">
          <h4
            className={`flex items-center justify-center text-sm font-sans text-gray-900 mb-4  transform transition-transform duration-300  hover:scale-105`}
          >
            Forget tokenization. Forget layout loss.
          </h4>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
