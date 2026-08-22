---
title: "[LeetCode] 53. Maximum Subarray"
date: "2019-06-17"
description: "Maximum Subarray Link to original Problem on LeetCode Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum. Example: Input: [-2,1,-3,4,-1,2,1,-5,4], Output: 6 Explanation: [4,-1,2,1] has the largest sum = 6. Follow up: If you have figured out the O(n) solution, try coding another solution using the divide and conquer approach, which is more subtle. Company: Facebook, Paypal, Yahoo, Microsoft, LinkedIn, Amazon, Goldman Sachs"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Maximum Subarray", "Dynamic Programming", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Maximum Subarray

[Link to original Problem on LeetCode](https://leetcode.com/problems/maximum-subarray/)

Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.

**Example:**

> Input: \[-2,1,-3,4,-1,2,1,-5,4\], Output: 6 Explanation: \[4,-1,2,1\] has the largest sum = 6. Follow up:

If you have figured out the O(n) solution, try coding another solution using the divide and conquer approach, which is more subtle.

**Company:** *Facebook*, *Paypal*, *Yahoo*, *Microsoft*, *LinkedIn*, *Amazon*, *Goldman Sachs*

**Solution 1 (Kadane’s Algorithm):**

```python
class Solution(object):
    def maxSubArray(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # Algorithm used: Kadane’s Algorithm
        # Take two variables
        # One will keep track of the current max sum
        # Other one will keep track of the global max sum
        # Pointing at an element there can be two options
        # i. Either that element combined with the previous elements is the max sum
        # ii. Or the element itself is greater than the previous sum

        # Make the first element the maxCurrent as well as maxGlobal
        maxCurrent, maxGlobal = nums[0], nums[0]
        
        # Loop starting from the second element and make a check
        for num in nums[1:]:
            # compare between current element and current + previous maxCurrent
            maxCurrent = max(num, maxCurrent + num)

            # If maxCurrent > maxGlobal then change maxGlobal
            # This is require in case say the current element is negative 
            # and previous maxCurrent is positive
            # Then value of maxCurrent will be num + maxCurrent 
            # and obviously it will be less then maxGlobal
            if maxCurrent > maxGlobal:
                maxGlobal = maxCurrent
        
        return maxGlobal
```

**Solution 2 (Dynamic Programming):**

```python
class Solution(object):
    def maxSubArray(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        
        # Bottom-Up-Approach
        # Make a copy of the array
        # We can also use the array itself, 
        # but for the sake of dynamic programming I am creating a cache
        cache = nums[:]
        
        # Loop starting from second element
        for i in range(1, len(cache)):
            # If the previous element is negative or zero keep the number as it is
            # Else add the previous cummulative sum
            if cache[i - 1] > 0:
                cache[i] = cache[i - 1] + cache[i]
                
        # Return max of the cache
        return max(cache)
```
